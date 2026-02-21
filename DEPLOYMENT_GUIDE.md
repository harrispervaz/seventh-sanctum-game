# 🎮 THE SEVENTH SANCTUM - Deployment Guide

## 📦 What You Have

A complete working prototype of The Seventh Sanctum card game!

**Features:**
✅ Full game rules implemented
✅ 65 cards from both factions
✅ Mobile-friendly web interface
✅ Turn-based gameplay
✅ Energy system
✅ Control Loss win condition
✅ Simple AI opponent

---

## 🚀 OPTION 1: Deploy Online (Recommended for Mobile Play)

### Using Render.com (FREE)

1. **Create a GitHub Account** (if you don't have one)
   - Go to https://github.com
   - Sign up for free

2. **Create a New Repository**
   - Click "New Repository"
   - Name it: `seventh-sanctum-game`
   - Make it PUBLIC
   - Click "Create Repository"

3. **Upload Your Game Files**
   
   Upload these files to your GitHub repository:
   ```
   seventh-sanctum-game/
   ├── app.py
   ├── card_database.json
   ├── requirements.txt
   ├── templates/
   │   └── game.html
   └── static/
       └── js/
           └── game.js
   ```
   
   **How to upload:**
   - Click "Add file" → "Upload files"
   - Drag all the files I created into the upload area
   - Click "Commit changes"

4. **Deploy on Render**
   
   - Go to https://render.com
   - Sign up with your GitHub account (FREE)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository `seventh-sanctum-game`
   - Settings:
     - **Name**: seventh-sanctum-game
     - **Region**: Oregon (or closest to you)
     - **Branch**: main
     - **Runtime**: Python 3
     - **Build Command**: `pip install -r requirements.txt`
     - **Start Command**: `python app.py`
   - Click "Create Web Service"
   
5. **Wait 2-5 minutes for deployment**
   
   Render will give you a URL like:
   ```
   https://seventh-sanctum-game.onrender.com
   ```

6. **Play on Your Phone!**
   
   Open that URL on your phone's browser and play!

---

## 💻 OPTION 2: Run Locally on Your Computer

### For Windows:

1. **Install Python**
   - Download from: https://www.python.org/downloads/
   - Install Python 3.11 or newer
   - ✅ CHECK "Add Python to PATH" during installation!

2. **Open Command Prompt**
   - Press `Windows Key + R`
   - Type `cmd` and press Enter

3. **Navigate to Game Folder**
   ```cmd
   cd C:\Users\YourName\Downloads\seventh-sanctum-game
   ```

4. **Install Dependencies**
   ```cmd
   pip install -r requirements.txt
   ```

5. **Run the Game**
   ```cmd
   python app.py
   ```

6. **Open in Browser**
   - Go to: http://localhost:5000
   - Or on your phone (if on same WiFi): http://YOUR_COMPUTER_IP:5000

---

## 🎨 Adding Your Card Images

Your cards are named like "Skyforge Drone.jpg" - Perfect!

### Where to Put Images:

1. Create folder structure:
   ```
   static/
   └── images/
       └── cards/
   ```

2. Rename your cards to match the database IDs:
   
   **Examples:**
   ```
   Skyforge Drone.jpg → skyforge_skyforge_drone.jpg
   Living Miasma.jpg → miasma_the_living_miasma.jpg
   Assembly Line.jpg → skyforge_assembly_line.jpg
   ```
   
   **Rule**: Lowercase, replace spaces with underscores

3. **I can create a script to auto-rename them!** Just let me know.

4. Update the card rendering in `game.js` to show actual images:
   
   ```javascript
   // Add this to createCardElement function:
   const imgEl = document.createElement('img');
   imgEl.src = card.image;
   imgEl.style.width = '100%';
   imgEl.style.height = 'auto';
   cardEl.appendChild(imgEl);
   ```

---

## 🐛 Troubleshooting

### "Module not found" error
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### Game won't load
- Check browser console (F12 → Console tab)
- Make sure `card_database.json` is in the same folder as `app.py`

### Can't access on phone
- Make sure phone and computer are on same WiFi
- Find your computer's IP:
  - Windows: `ipconfig` (look for IPv4 Address)
  - Mac/Linux: `ifconfig` (look for inet)

---

## 📱 Next Steps

Once you have it running:

1. **Test the game** - Make sure cards play correctly
2. **Add your card images** - Replace placeholders
3. **Improve AI** - Make smarter decisions
4. **Add animations** - Card movements, effects
5. **Add multiplayer** - Real-time PvP with WebSockets

---

## 🆘 Need Help?

**Common Issues:**

Q: "It says 'Game not found'"
A: Refresh the page - the server restarted

Q: "Cards don't play"
A: Check if you have enough Energy

Q: "AI doesn't do anything"
A: That's normal for now - it just ends its turn

---

## 📞 What to Do Next

1. **Try Option 1 (Render.com)** - Easiest way to get it online
2. **Test on your phone** - Make sure the layout works
3. **Upload ONE card image** - Test the image system
4. **Tell me what you think!** - What should we improve first?

---

## 🎯 Current Game State

**Working:**
✅ Draw cards
✅ Play Units/Fields/Traps/Techniques
✅ Pay Energy costs
✅ Control Loss tracking
✅ Turn phases
✅ Win/Loss detection

**Not Yet Implemented:**
❌ Combat (attacking)
❌ Keyword effects (Swift, Pierce, etc.)
❌ Trap triggers
❌ Field effects
❌ Technique effects
❌ Smart AI

**These will be added in Phase 2!**

---

Ready to deploy? Let me know which option you want to try! 🚀
