package routes

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestIntelligenceRadarRoutesProxyFixedUpstreams(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var requestedHistory string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ratings" {
			requestedHistory = r.URL.Query().Get("history")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer upstream.Close()

	router := gin.New()
	registerIntelligenceRadarRoutes(router.Group("/api/v1"), upstream.Client(), upstream.URL+"/ratings", upstream.URL+"/efficiency")

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/v1/intelligence-radar/ratings?history=14", nil))

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "14", requestedHistory)
	require.JSONEq(t, `{"ok":true}`, recorder.Body.String())
	require.Equal(t, "public, max-age=60", recorder.Header().Get("Cache-Control"))
}

func TestIntelligenceRadarRoutesRejectInvalidHistory(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerIntelligenceRadarRoutes(router.Group("/api/v1"), http.DefaultClient, "https://example.test/ratings", "https://example.test/efficiency")

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/v1/intelligence-radar/ratings?history=31", nil))

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.JSONEq(t, `{"message":"history must be an integer from 0 to 30"}`, recorder.Body.String())
}
