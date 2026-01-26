package main

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// ProxyRequest represents the request body from frontend
type ProxyRequest struct {
	Endpoint     string                 `json:"endpoint"`
	Method       string                 `json:"method"`
	Body         map[string]interface{} `json:"body"`
	SessionToken string                 `json:"session_token"`
	UserAgent    string                 `json:"user_agent"`
}

// startProxyServer starts a local HTTP server that proxies API requests
func main() {
	// Serve static files
	fs := http.FileServer(http.Dir("."))
	http.Handle("/", fs)

	// API endpoints
	http.HandleFunc("/api/proxy", handleProxyRequest)
	http.HandleFunc("/api/health", handleHealth)

	port := ":80"
	log.Printf("Starting proxy server on http://localhost%s", port)
	log.Printf("Open http://localhost%s in your browser", port)
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Printf("Proxy server error: %v", err)
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleProxyRequest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodOptions {
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Only POST allowed", http.StatusMethodNotAllowed)
		return
	}

	var proxyReq ProxyRequest
	if err := json.NewDecoder(r.Body).Decode(&proxyReq); err != nil {
		http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
		return
	}

	// Make the actual request to Dostavista API
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	var reqBody io.Reader
	if proxyReq.Body != nil {
		bodyBytes, _ := json.Marshal(proxyReq.Body)
		reqBody = bytes.NewReader(bodyBytes)
	}

	req, err := http.NewRequest(proxyReq.Method, proxyReq.Endpoint, reqBody)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create request: %v", err), http.StatusInternalServerError)
		return
	}

	// Set headers
	req.Header.Set("User-Agent", proxyReq.UserAgent)
	if proxyReq.SessionToken != "" {
		req.Header.Set("X-DV-Session", proxyReq.SessionToken)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Encoding", "gzip")

	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf("API request failed: %v", err), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	// Handle gzip
	var reader io.Reader = resp.Body
	if resp.Header.Get("Content-Encoding") == "gzip" {
		gzReader, err := gzip.NewReader(resp.Body)
		if err == nil {
			defer gzReader.Close()
			reader = gzReader
		}
	}

	// Read and return response
	body, _ := io.ReadAll(reader)
	w.WriteHeader(resp.StatusCode)
	w.Write(body)
}
