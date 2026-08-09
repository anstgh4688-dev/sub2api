package routes

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	intelligenceRadarRatingsURL    = "https://codexradar.com/api/model-ratings"
	intelligenceRadarEfficiencyURL = "https://codexradar.com/data/intelligence-efficiency.json"
	maxRadarHistoryDays            = 30
	maxRadarResponseBytes          = 2 << 20
)

var intelligenceRadarHTTPClient = &http.Client{Timeout: 15 * time.Second}

// RegisterIntelligenceRadarRoutes exposes a same-origin read-only proxy for Codex Radar's public data.
func RegisterIntelligenceRadarRoutes(v1 *gin.RouterGroup) {
	registerIntelligenceRadarRoutes(v1, intelligenceRadarHTTPClient, intelligenceRadarRatingsURL, intelligenceRadarEfficiencyURL)
}

func registerIntelligenceRadarRoutes(v1 *gin.RouterGroup, client *http.Client, ratingsURL, efficiencyURL string) {
	radar := v1.Group("/intelligence-radar")
	radar.GET("/ratings", proxyRadarRatings(client, ratingsURL))
	radar.GET("/efficiency", proxyRadarData(client, efficiencyURL, 10*time.Minute))
}

func proxyRadarRatings(client *http.Client, rawURL string) gin.HandlerFunc {
	return func(c *gin.Context) {
		historyDays, err := parseRadarHistoryDays(c.Query("history"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
			return
		}

		upstream, err := url.Parse(rawURL)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "invalid intelligence radar ratings upstream"})
			return
		}
		query := upstream.Query()
		query.Set("history", strconv.Itoa(historyDays))
		upstream.RawQuery = query.Encode()
		proxyRadarJSON(c, client, upstream.String(), time.Minute)
	}
}

func proxyRadarData(client *http.Client, upstreamURL string, cacheTTL time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		proxyRadarJSON(c, client, upstreamURL, cacheTTL)
	}
}

func proxyRadarJSON(c *gin.Context, client *http.Client, upstreamURL string, cacheTTL time.Duration) {
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodGet, upstreamURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "failed to create intelligence radar request"})
		return
	}
	req.Header.Set("Accept", "application/json")

	res, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"message": "intelligence radar upstream is unavailable"})
		return
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		c.JSON(http.StatusBadGateway, gin.H{"message": fmt.Sprintf("intelligence radar upstream returned HTTP %d", res.StatusCode)})
		return
	}
	if res.ContentLength > maxRadarResponseBytes {
		c.JSON(http.StatusBadGateway, gin.H{"message": "intelligence radar upstream response is too large"})
		return
	}

	body, err := io.ReadAll(io.LimitReader(res.Body, maxRadarResponseBytes+1))
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"message": "failed to read intelligence radar upstream response"})
		return
	}
	if len(body) > maxRadarResponseBytes {
		c.JSON(http.StatusBadGateway, gin.H{"message": "intelligence radar upstream response is too large"})
		return
	}

	c.Header("Cache-Control", fmt.Sprintf("public, max-age=%d", int(cacheTTL.Seconds())))
	c.Data(http.StatusOK, "application/json; charset=utf-8", body)
}

func parseRadarHistoryDays(raw string) (int, error) {
	if raw == "" {
		return 14, nil
	}
	days, err := strconv.Atoi(raw)
	if err != nil || days < 0 || days > maxRadarHistoryDays {
		return 0, fmt.Errorf("history must be an integer from 0 to %d", maxRadarHistoryDays)
	}
	return days, nil
}
