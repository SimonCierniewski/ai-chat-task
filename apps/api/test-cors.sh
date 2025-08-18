#!/bin/bash

# Test CORS configuration for the API
# Usage: ./test-cors.sh

API_URL="http://localhost:3000"
ADMIN_ORIGIN="http://localhost:3001"
ANDROID_ORIGIN="http://localhost:8081"
INVALID_ORIGIN="http://evil.com"

echo "🔍 Testing CORS Configuration"
echo "================================"

# Test health endpoint (no CORS required)
echo -e "\n✅ Testing /health endpoint (no CORS):"
curl -s "$API_URL/health" | jq '.'

# Test preflight from allowed admin origin
echo -e "\n✅ Testing preflight from Admin origin ($ADMIN_ORIGIN):"
curl -s -X OPTIONS "$API_URL/api/me" \
  -H "Origin: $ADMIN_ORIGIN" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization" \
  -v 2>&1 | grep -E "(< HTTP|< Access-Control-)"

# Test preflight from allowed Android origin
echo -e "\n✅ Testing preflight from Android origin ($ANDROID_ORIGIN):"
curl -s -X OPTIONS "$API_URL/api/me" \
  -H "Origin: $ANDROID_ORIGIN" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization" \
  -v 2>&1 | grep -E "(< HTTP|< Access-Control-)"

# Test preflight from invalid origin (should fail)
echo -e "\n❌ Testing preflight from invalid origin ($INVALID_ORIGIN):"
curl -s -X OPTIONS "$API_URL/api/me" \
  -H "Origin: $INVALID_ORIGIN" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization" \
  -w "\nHTTP Status: %{http_code}\n"

# Test actual request with valid origin
echo -e "\n✅ Testing actual request with Admin origin:"
curl -s "$API_URL/api/auth/status" \
  -H "Origin: $ADMIN_ORIGIN" \
  -v 2>&1 | grep -E "(< HTTP|< Access-Control-Allow-Origin)"

echo -e "\n================================"
echo "📋 CORS Test Complete!"
echo ""
echo "Expected results:"
echo "- Admin and Android origins should return Access-Control headers"
echo "- Invalid origin should return 403 for preflight"
echo "- Health endpoint should work without CORS headers"