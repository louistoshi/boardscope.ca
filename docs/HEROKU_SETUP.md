# Deploy to Heroku — License Validation Server

Deploy your BoardScope server to Heroku so customers can validate license keys.

## 🚀 Quick Setup (5 minutes)

### Prerequisites
- Heroku account (free): https://www.heroku.com
- Heroku CLI: `brew install heroku/brew/heroku`

### Step 1: Login to Heroku
```bash
heroku login
```

### Step 2: Create a Heroku App
```bash
cd "/Users/macbookair/boardscope beta/boardscope_5 2"

# Create app (replace "boardscope-server" with your desired name)
heroku create boardscope-server
```

Output will show:
```
Creating ⬢ boardscope-server... done
https://boardscope-server.herokuapp.com/ | https://git.heroku.com/boardscope-server.git
```

**Note:** Your server URL will be: `https://boardscope-server.herokuapp.com`

### Step 3: Set Environment Variables
```bash
heroku config:set POLAR_ORG_ID="6495f637-d621-4682-a78d-c99365ad90c6"
```

Verify:
```bash
heroku config
```

### Step 4: Deploy
```bash
git push heroku main
```

Heroku automatically builds and deploys your server.

### Step 5: Verify It's Running
```bash
heroku logs --tail
# You should see: "Server running on port 8080"
```

Or visit: `https://boardscope-server.herokuapp.com/` (should show "BoardScope License Server")

---

## 🔗 Update Your App

Customers' apps now validate licenses against your server.

In `boardview.html`, the license validation endpoint is already configured to:
```javascript
POST /license-validate
```

The app will automatically use the correct server based on environment.

---

## 💰 Cost

- **Free Tier**: $0/month (limited: sleeps after 30 min inactivity)
- **Hobby Tier**: $7/month (always running, recommended for production)
- **Standard Tier**: $50/month (for high traffic)

To upgrade from free to hobby:
```bash
heroku dyno:type standard-1x -a boardscope-server
```

---

## 🧪 Test Your Server

```bash
curl https://boardscope-server.herokuapp.com/

# Should return: "BoardScope License Server"
```

Test license validation:
```bash
curl -X POST https://boardscope-server.herokuapp.com/license-validate \
  -H "Content-Type: application/json" \
  -d '{"key":"test123"}'

# Should return: {"valid":false, "error":"Key not found or already deactivated"}
```

---

## 🔧 Troubleshooting

### Server not starting?
```bash
heroku logs --tail
# Check for errors
```

### Environment variable not set?
```bash
heroku config
# Verify POLAR_ORG_ID is there
```

### Need to redeploy?
```bash
git push heroku main
```

### View server logs?
```bash
heroku logs --tail
```

---

## 📝 How It Works

1. **Customer enters license key** in BoardScope Settings
2. **App sends key** to `https://boardscope-server.herokuapp.com/license-validate`
3. **Your server validates** against Polar's API
4. **Polar confirms** key is valid and returns license plan
5. **Pro features unlock** ✅

---

## 🚀 You're Live!

Your license server is now running in production. Customers can:
- ✅ Activate licenses instantly
- ✅ Validate against Polar's authoritative database
- ✅ No serial number issues — modern key-based licensing

---

## Optional: Heroku Webhook for Polar

If you want automatic license delivery emails from Polar:

1. Go to https://dashboard.polar.sh
2. Settings → Webhooks
3. Add webhook:
   - **URL**: `https://boardscope-server.herokuapp.com/polar-webhook`
   - **Events**: checkout.completed, subscription.created, license.granted
4. Save webhook secret and add to Heroku:
   ```bash
   heroku config:set POLAR_WEBHOOK_SECRET="your_webhook_secret"
   ```

(Optional for MVP, can add later)

---

*Your license server is now live!*
