# 🔧 TROUBLESHOOTING: 404 on game.js

## The Problem
Your browser shows: `Failed to load resource: game.js 404`

This means the **static files aren't being served** by your deployment platform.

---

## ✅ SOLUTION 1: Verify File Structure

Make sure your deployment has this **exact structure**:

```
your-app/
├── app.py
├── card_database.json
├── requirements.txt
├── templates/
│   └── game.html
└── static/
    ├── css/
    ├── images/
    │   ├── card-back.svg
    │   ├── cards/
    │   └── cards-full/
    └── js/
        └── game.js  ← THIS FILE MUST BE HERE
```

---

## ✅ SOLUTION 2: Platform-Specific Fixes

### **If Using Render:**

1. **Go to your Render dashboard**
2. **Click on your service**
3. **Click "Manual Deploy"** → **"Deploy latest commit"**
4. **Wait for build to complete** (watch the logs)
5. **Hard refresh browser** (Ctrl+Shift+R)

**IMPORTANT:** Render sometimes caches the old build. You need to:
- Delete the service completely
- Create a new one
- Redeploy

### **If Using Heroku:**

1. **Make sure you have a `Procfile`:**
```
web: gunicorn app:app
```

2. **Redeploy:**
```bash
git add .
git commit -m "Fix static files"
git push heroku main
```

3. **Restart dynos:**
```bash
heroku restart
```

### **If Using PythonAnywhere:**

1. **Upload files to `/home/yourusername/mysite/`**
2. **Make sure static files are in `/home/yourusername/mysite/static/`**
3. **Go to Web tab**
4. **Click "Reload" button**
5. **Check static files mapping:**
   - URL: `/static/`
   - Directory: `/home/yourusername/mysite/static/`

### **If Using Railway:**

1. **Commit and push changes**
2. **Railway auto-deploys**
3. **Check deployment logs**
4. **Hard refresh browser**

---

## ✅ SOLUTION 3: Test Server Manually

Visit this URL in your browser:
```
https://your-app-url.com/api/test
```

**Expected response:**
```json
{"status": "ok", "message": "Server is running!"}
```

If you see this → **Server is working!**
If you get 404 → **Server isn't running or URL is wrong**

---

## ✅ SOLUTION 4: Check Static File Directly

Try visiting the game.js file directly:
```
https://your-app-url.com/static/js/game.js
```

**What you should see:**
- Lots of JavaScript code

**What indicates a problem:**
- 404 error → File not uploaded or wrong location
- 403 error → Permission issue
- Blank page → File is empty (corruption)

---

## ✅ SOLUTION 5: Nuclear Option - Fresh Deploy

If nothing else works:

1. **Download the fresh package** (from previous message)
2. **Extract it to a NEW folder**
3. **Delete your old deployment completely**
4. **Create a brand new deployment**
5. **Upload ALL files fresh**
6. **Deploy**
7. **Wait for build to complete**
8. **Visit the site in an incognito window** (no cache)

---

## 🔍 Common Issues

### **Issue: "It works locally but not on server"**
**Cause:** Case sensitivity on Linux servers
**Fix:** Make sure all paths match exactly:
- `static/js/game.js` (lowercase)
- NOT `Static/JS/game.js`

### **Issue: "Files uploaded but still 404"**
**Cause:** Wrong upload location
**Fix:** Files must be in the **root** of your app, not in a subfolder

### **Issue: "Server keeps restarting"**
**Cause:** Python syntax error in app.py
**Fix:** Check server logs for errors

### **Issue: "Some files load, others don't"**
**Cause:** Incomplete upload
**Fix:** Re-upload ALL files, wait for deployment to finish

---

## 📋 Deployment Checklist

Before deploying, verify:

- [ ] `app.py` is in root folder
- [ ] `static/` folder exists
- [ ] `static/js/game.js` exists and is **106 KB**
- [ ] `templates/game.html` exists
- [ ] `card_database.json` exists
- [ ] `requirements.txt` exists
- [ ] All file paths use forward slashes `/`
- [ ] No spaces in folder names
- [ ] Server has been restarted after upload
- [ ] Browser cache has been cleared

---

## 🆘 Still Not Working?

1. **Check server logs** - Look for errors
2. **Visit /api/test** - Make sure server is running
3. **Try incognito mode** - Rules out cache issues
4. **Check file sizes** - Make sure files uploaded completely
5. **Restart the server** - Sometimes it just needs a reboot

---

## 💡 Quick Diagnostics

**Open browser console and run:**
```javascript
fetch('/api/test')
  .then(r => r.json())
  .then(d => console.log('Server status:', d))
  .catch(e => console.error('Server error:', e))
```

**If you see:** `Server status: {status: "ok", ...}` → **Server works!**
**If you see:** Error → **Server not responding**

---

**Good luck! Most of the time it's just a caching issue or incomplete deployment.** 🚀
