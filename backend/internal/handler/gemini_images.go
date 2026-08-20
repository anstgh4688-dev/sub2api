package handler

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	pkghttputil "github.com/Wei-Shaw/sub2api/internal/pkg/httputil"
	"github.com/Wei-Shaw/sub2api/internal/pkg/ip"
	"github.com/Wei-Shaw/sub2api/internal/pkg/logger"
	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// geminiImageCaptureResponseWriter 捕获上游响应写入的 gin ResponseWriter 代理。
//
// 选择 capture-writer 而非复制一套 Gemini 转发：ForwardNative 已经具备重试、
// 错误策略、上游图片观测（gemini_image_output_accounting.go）与 usage 提取，
// 直接复用可保证 Gemini 图片链路与原生链路共享同一套转发/计费真相，避免
// 第二套实现漂移（规格 7.2）。捕获内容随后归一化为统一 OpenAI Images 形状。
type geminiImageCaptureResponseWriter struct {
	gin.ResponseWriter
	status  int
	buffer  bytes.Buffer
	headers http.Header
}

func newGeminiImageCaptureResponseWriter(inner gin.ResponseWriter) *geminiImageCaptureResponseWriter {
	return &geminiImageCaptureResponseWriter{
		ResponseWriter: inner,
		status:         http.StatusOK,
		headers:        make(http.Header),
	}
}

func (w *geminiImageCaptureResponseWriter) Header() http.Header { return w.headers }

func (w *geminiImageCaptureResponseWriter) WriteHeader(code int) {
	if w.status != code {
		w.status = code
	}
}

func (w *geminiImageCaptureResponseWriter) Write(data []byte) (int, error) {
	return w.buffer.Write(data)
}

func (w *geminiImageCaptureResponseWriter) WriteString(s string) (int, error) {
	return w.buffer.WriteString(s)
}

func (w *geminiImageCaptureResponseWriter) Status() int         { return w.status }
func (w *geminiImageCaptureResponseWriter) Size() int           { return w.buffer.Len() }
func (w *geminiImageCaptureResponseWriter) Written() bool       { return w.buffer.Len() > 0 }
func (w *geminiImageCaptureResponseWriter) WriteHeaderNow()     {}
func (w *geminiImageCaptureResponseWriter) Pusher() http.Pusher { return nil }

// Hijack / Flush / CloseNotify 仅用于接口完整性；ForwardNative 的非流式路径不会用到。
func (w *geminiImageCaptureResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	return nil, nil, fmt.Errorf("hijacking is not supported for gemini images")
}
func (w *geminiImageCaptureResponseWriter) Flush() {}

// geminiImagesRequestID 从捕获的上游响应头中取 request ID（规格 7.5/8：错误与
// 成功路径都必须保留可定位的 request ID）。ForwardNative 把上游
// x-request-id（API Key 型）或 x-goog-request-id 写到内层 context 的响应头，
// 这里统一取出来透传给真实响应。
func geminiImagesRequestID(header http.Header) string {
	if header == nil {
		return ""
	}
	if id := strings.TrimSpace(header.Get("x-request-id")); id != "" {
		return id
	}
	return strings.TrimSpace(header.Get("x-goog-request-id"))
}

// setGeminiImageRequestID 把上游 request ID 设置到真实响应头，供客户端定位问题。
func setGeminiImageRequestID(c *gin.Context, requestID string) {
	if c != nil && requestID != "" {
		c.Header("x-request-id", requestID)
	}
}

// GeminiImages 通过统一 /v1/images/generations 端点处理 Gemini 分组同步生图，
// 与 OpenAI/Grok 图片链路具备同等控制：鉴权、分组权限、安全审计、图片并发、
// 用户并发、账号并发、账号调度、计费与 usage 记录。返回统一 OpenAI Images 形状。
func (h *GatewayHandler) GeminiImages(c *gin.Context) {
	streamStarted := false
	requestStart := time.Now()

	apiKey, ok := middleware.GetAPIKeyFromContext(c)
	if !ok || apiKey == nil {
		h.errorResponse(c, http.StatusUnauthorized, "authentication_error", "Invalid API key")
		return
	}
	subject, ok := middleware.GetAuthSubjectFromContext(c)
	if !ok {
		h.errorResponse(c, http.StatusInternalServerError, "api_error", "User context not found")
		return
	}
	reqLog := requestLogger(
		c,
		"handler.gateway.gemini_images",
		zap.Int64("user_id", subject.UserID),
		zap.Int64("api_key_id", apiKey.ID),
		zap.Any("group_id", apiKey.GroupID),
	)

	body, err := pkghttputil.ReadRequestBodyWithPrealloc(c.Request)
	if err != nil {
		if maxErr, ok := extractMaxBytesError(err); ok {
			h.errorResponse(c, http.StatusRequestEntityTooLarge, "invalid_request_error", buildBodyTooLargeMessage(maxErr.Limit))
			return
		}
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Failed to read request body")
		return
	}
	if len(body) == 0 {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Request body is empty")
		return
	}

	parsed, err := service.ParseGeminiImagesRequest(body)
	if err != nil {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", err.Error())
		return
	}
	requestModel := parsed.Model
	reqLog = reqLog.With(zap.String("model", requestModel))

	setOpsRequestContext(c, requestModel, false)
	setOpsEndpointContext(c, "", int16(service.RequestTypeFromLegacy(false, false)))

	if !service.GroupAllowsImageGeneration(apiKey.Group) {
		h.errorResponse(c, http.StatusForbidden, "permission_error", service.ImageGenerationPermissionMessage())
		return
	}
	if decision := h.checkSecurityAudit(c, reqLog, apiKey, subject, service.ContentModerationProtocolOpenAIImages, requestModel, body); decision != nil && !decision.AllowNextStage {
		h.openAISecurityAuditError(c, decision)
		return
	}

	imageReleaseFunc, acquired := h.acquireImageGenerationSlot(c, streamStarted)
	if !acquired {
		return
	}
	if imageReleaseFunc != nil {
		defer imageReleaseFunc()
	}

	if h.errorPassthroughService != nil {
		service.BindErrorPassthroughService(c, h.errorPassthroughService)
	}
	subscription, _ := middleware.GetSubscriptionFromContext(c)
	service.SetOpsLatencyMs(c, service.OpsAuthLatencyMsKey, time.Since(requestStart).Milliseconds())

	userReleaseFunc, err := h.concurrencyHelper.AcquireUserSlotWithWait(c, subject.UserID, subject.Concurrency, false, &streamStarted)
	if err != nil {
		reqLog.Warn("gemini_images.user_slot_acquire_failed", zap.Error(err))
		h.handleConcurrencyError(c, err, "user", streamStarted)
		return
	}
	userReleaseFunc = wrapReleaseOnDone(c.Request.Context(), userReleaseFunc)
	if userReleaseFunc != nil {
		defer userReleaseFunc()
	}

	if err := h.billingCacheService.CheckBillingEligibility(c.Request.Context(), apiKey.User, apiKey, apiKey.Group, subscription, service.QuotaPlatform(c.Request.Context(), apiKey)); err != nil {
		reqLog.Info("gemini_images.billing_eligibility_check_failed", zap.Error(err))
		status, _, message, retryAfter := billingErrorDetails(err)
		if retryAfter > 0 {
			c.Header("Retry-After", fmt.Sprintf("%d", retryAfter))
		}
		h.errorResponse(c, status, "rate_limit_error", message)
		return
	}

	geminiBody, err := service.BuildGeminiImagesGenerateContentBody(parsed)
	if err != nil {
		h.errorResponse(c, http.StatusInternalServerError, "api_error", "Failed to build Gemini request")
		return
	}

	channelMapping, _ := h.gatewayService.ResolveChannelMappingAndRestrict(c.Request.Context(), apiKey.GroupID, requestModel)
	reqModel := requestModel
	if channelMapping.Mapped {
		requestModel = channelMapping.MappedModel
	}

	pricingCtx, pricingAt := service.WithGatewayTokenRequestPricing(c.Request.Context())
	c.Request = c.Request.WithContext(pricingCtx)
	requestCtx := c.Request.Context()
	// Gemini 图片按媒体倍率计费，不在 token 利润门范围内，与 Grok 媒体一致。
	requestCtx = service.WithOpenAIProfitControlSuppressed(requestCtx)

	sessionHash := service.HashUsageRequestPayload(body)
	fs := NewFailoverState(h.maxAccountSwitchesGemini, false)
	routingStart := time.Now()

	for {
		if failoverClientGone(c) {
			return
		}
		selection, err := h.gatewayService.SelectAccountWithLoadAwareness(requestCtx, apiKey.GroupID, sessionHash, requestModel, fs.FailedAccountIDs, "", int64(0))
		if err != nil {
			if len(fs.FailedAccountIDs) == 0 {
				cls := classifyNoAccountErrorFromGin(c, h.gatewayService, apiKey, requestModel, requestModel, service.PlatformGemini)
				if !cls.ModelNotFound {
					markOpsRoutingCapacityLimitedIfNoAvailable(c, err)
				}
				message := cls.Message
				if !cls.ModelNotFound {
					message = "No available Gemini accounts: " + err.Error()
				}
				h.errorResponse(c, cls.Status, cls.ErrType, message)
				return
			}
			switch fs.HandleSelectionExhausted(requestCtx) {
			case FailoverContinue:
				ctx := service.WithSingleAccountRetry(requestCtx, true, h.metadataBridgeEnabled())
				requestCtx = ctx
				continue
			case FailoverCanceled:
				failoverClientGone(c)
				return
			default: // FailoverExhausted
				h.handleGeminiFailoverExhausted(c, fs.LastFailoverErr)
				return
			}
		}
		if selection == nil || selection.Account == nil {
			markOpsRoutingCapacityLimited(c)
			h.errorResponse(c, http.StatusServiceUnavailable, "api_error", "No available Gemini accounts")
			return
		}
		account := selection.Account
		setOpsSelectedAccount(c, account.ID, account.Platform)

		accountReleaseFunc := selection.ReleaseFunc
		if !selection.Acquired {
			if selection.WaitPlan == nil {
				markOpsRoutingCapacityLimited(c)
				h.errorResponse(c, http.StatusServiceUnavailable, "api_error", "No available Gemini accounts")
				return
			}
			accountWaitCounted := false
			canWait, err := h.concurrencyHelper.IncrementAccountWaitCount(requestCtx, account.ID, selection.WaitPlan.MaxWaiting)
			if err != nil {
				reqLog.Warn("gemini_images.account_wait_counter_increment_failed", zap.Int64("account_id", account.ID), zap.Error(err))
			} else if !canWait {
				h.errorResponse(c, http.StatusTooManyRequests, "api_error", "Too many pending requests, please retry later")
				return
			}
			if err == nil && canWait {
				accountWaitCounted = true
			}
			defer func() {
				if accountWaitCounted {
					h.concurrencyHelper.DecrementAccountWaitCount(requestCtx, account.ID)
				}
			}()

			accountReleaseFunc, err = h.concurrencyHelper.AcquireAccountSlotWithWaitTimeout(
				c,
				account.ID,
				selection.WaitPlan.MaxConcurrency,
				selection.WaitPlan.Timeout,
				false,
				&streamStarted,
			)
			if err != nil {
				reqLog.Warn("gemini_images.account_slot_acquire_failed", zap.Int64("account_id", account.ID), zap.Error(err))
				h.errorResponse(c, http.StatusTooManyRequests, "api_error", err.Error())
				return
			}
			if accountWaitCounted {
				h.concurrencyHelper.DecrementAccountWaitCount(requestCtx, account.ID)
				accountWaitCounted = false
			}
		}
		admissionCtx := service.ContextWithSelectionProfitGate(requestCtx, selection)
		latest, vetoed, reason := h.gatewayService.GatewayProfitControlVetoLatest(admissionCtx, account)
		if vetoed {
			if accountReleaseFunc != nil {
				accountReleaseFunc()
			}
			reqLog.Debug("gemini_images.account_slot_profit_vetoed", zap.Int64("account_id", account.ID), zap.String("reason", reason))
			if fs.RecordProfitVeto(account.ID) == FailoverExhausted {
				reqLog.Warn("gemini_images.profit_veto_attempts_exhausted", zap.Int("profit_veto_count", fs.ProfitVetoCount()))
				markOpsRoutingCapacityLimited(c)
				h.errorResponse(c, http.StatusServiceUnavailable, "api_error", profitVetoExhaustedMessage)
				return
			}
			continue
		}
		account = latest
		selection.Account = latest
		accountReleaseFunc = wrapReleaseOnDone(c.Request.Context(), accountReleaseFunc)
		if accountReleaseFunc != nil {
			defer accountReleaseFunc()
		}

		service.SetOpsLatencyMs(c, service.OpsRoutingLatencyMsKey, time.Since(routingStart).Milliseconds())
		writerSizeBeforeForward := c.Writer.Size()
		result, captured, statusCode, requestID, fwdErr := h.forwardGeminiImages(requestCtx, c, account, requestModel, geminiBody)
		if accountReleaseFunc != nil {
			accountReleaseFunc()
		}

		if fwdErr != nil {
			var failoverErr *service.UpstreamFailoverError
			if errors.As(fwdErr, &failoverErr) {
				if failoverClientGone(c) {
					return
				}
				if h.openAIGatewayService != nil && failoverErr.ShouldReportAccountScheduleFailure() {
					h.openAIGatewayService.ReportOpenAIAccountScheduleResult(account.ID, requestModel, false, nil)
				}
				switch fs.HandleFailoverError(requestCtx, h.gatewayService, account.ID, account.Platform, account.GetPoolModeRetryCount(), failoverErr) {
				case FailoverContinue:
					continue
				case FailoverExhausted:
					setGeminiImageRequestID(c, failoverErr.ResponseHeaders.Get("x-request-id"))
					h.handleGeminiFailoverExhausted(c, fs.LastFailoverErr)
					return
				case FailoverCanceled:
					failoverClientGone(c)
					return
				}
			}
			reqLog.Warn("gemini_images.forward_failed", zap.Int64("account_id", account.ID), zap.Error(fwdErr))
			if !service.IsResponseCommitted(c) && c.Writer.Size() == writerSizeBeforeForward {
				setGeminiImageRequestID(c, requestID)
				h.errorResponse(c, http.StatusBadGateway, "upstream_error", "Upstream request failed")
			}
			return
		}
		if h.openAIGatewayService != nil {
			h.openAIGatewayService.ReportOpenAIAccountScheduleResult(account.ID, requestModel, true, nil)
		}

		if statusCode >= 400 {
			setGeminiImageRequestID(c, requestID)
			message := strings.TrimSpace(service.ExtractUpstreamErrorMessage(captured))
			if message == "" {
				message = fmt.Sprintf("Gemini upstream returned status %d", statusCode)
			}
			h.errorResponse(c, statusCode, "upstream_error", message)
			return
		}

		normalized, err := service.NormalizeGeminiImagesResponse(captured)
		if err != nil {
			reqLog.Warn("gemini_images.normalize_failed", zap.Int64("account_id", account.ID), zap.Error(err))
			setGeminiImageRequestID(c, requestID)
			h.errorResponse(c, http.StatusBadGateway, "upstream_error", "Gemini response contains no image parts")
			return
		}
		setGeminiImageRequestID(c, requestID)
		c.Data(http.StatusOK, "application/json", normalized)
		service.MarkResponseCommitted(c)

		upstreamModel := requestModel
		if mapped := strings.TrimSpace(account.GetMappedModel(requestModel)); mapped != "" {
			upstreamModel = mapped
		}
		recordGeminiImageUsage(c, h, reqLog, apiKey, subject, subscription, account, result, body, channelMapping, reqModel, upstreamModel, pricingAt)
		reqLog.Debug("gemini_images.request_completed", zap.Int64("account_id", account.ID))
		return
	}
}

// forwardGeminiImages 复用 GeminiMessagesCompatService.ForwardNative 转发
// generateContent，通过 capture-writer 捕获上游响应、状态码与 request ID，
// 返回归一化前的原始上游体。
func (h *GatewayHandler) forwardGeminiImages(
	ctx context.Context,
	c *gin.Context,
	account *service.Account,
	mappedModel string,
	geminiBody []byte,
) (*service.ForwardResult, []byte, int, string, error) {
	if h == nil || h.geminiCompatService == nil {
		return nil, nil, 0, "", fmt.Errorf("gemini compat service is not configured")
	}
	capture := newGeminiImageCaptureResponseWriter(c.Writer)
	// Copy 生成不含锁的浅拷贝（gin.Context 内嵌 sync.RWMutex，直接 *c 复制会触发 vet）。
	inner := c.Copy()
	inner.Writer = capture
	result, fwdErr := h.geminiCompatService.ForwardNative(ctx, inner, account, mappedModel, "generateContent", false, geminiBody)
	if fwdErr != nil {
		return nil, nil, 0, "", fwdErr
	}
	return result, capture.buffer.Bytes(), capture.status, geminiImagesRequestID(capture.Header()), nil
}

// recordGeminiImageUsage 异步提交 Gemini 图片请求的 usage 记录。
// 只保留模型、成本、图片数量/尺寸、请求哈希等元数据，不新增 prompt/图片内容字段。
func recordGeminiImageUsage(
	c *gin.Context,
	h *GatewayHandler,
	reqLog *zap.Logger,
	apiKey *service.APIKey,
	subject middleware.AuthSubject,
	subscription *service.UserSubscription,
	account *service.Account,
	result *service.ForwardResult,
	body []byte,
	channelMapping service.ChannelMappingResult,
	reqModel string,
	upstreamModel string,
	pricingAt time.Time,
) {
	if h == nil || h.gatewayService == nil {
		return
	}
	userAgent := c.GetHeader("User-Agent")
	clientIP := ip.GetClientIP(c)
	requestPayloadHash := service.HashUsageRequestPayload(body)
	inboundEndpoint := GetInboundEndpoint(c)
	upstreamEndpoint := GetUpstreamEndpoint(c, account.Platform)
	quotaPlatform := service.QuotaPlatform(c.Request.Context(), apiKey)
	sessionID := service.ExtractClientSessionID(c)

	h.submitUsageRecordTask(c.Request.Context(), func(ctx context.Context) {
		if err := h.gatewayService.RecordUsageWithLongContext(ctx, &service.RecordUsageLongContextInput{
			Result:                result,
			QuotaPlatform:         quotaPlatform,
			APIKey:                apiKey,
			User:                  apiKey.User,
			Account:               account,
			Subscription:          subscription,
			PricingAt:             pricingAt,
			InboundEndpoint:       inboundEndpoint,
			UpstreamEndpoint:      upstreamEndpoint,
			UserAgent:             userAgent,
			IPAddress:             clientIP,
			RequestPayloadHash:    requestPayloadHash,
			LongContextThreshold:  200000,
			LongContextMultiplier: 2.0,
			APIKeyService:         h.apiKeyService,
			SessionID:             sessionID,
			ChannelUsageFields:    clientRequestedUsageFields(c, channelMapping, reqModel, upstreamModel),
		}); err != nil {
			logger.L().With(
				zap.String("component", "handler.gateway.gemini_images"),
				zap.Int64("user_id", subject.UserID),
				zap.Int64("api_key_id", apiKey.ID),
				zap.Any("group_id", apiKey.GroupID),
				zap.String("model", reqModel),
				zap.Int64("account_id", account.ID),
			).Error("gemini_images.record_usage_failed", zap.Error(err))
		}
	})
}
