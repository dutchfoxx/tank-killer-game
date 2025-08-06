# 🚗 Tank Killer - Multiplayer Battle Game

A real-time multiplayer tank battle game built with Node.js, Express, Socket.io, and HTML5 Canvas. Players control tanks on mobile devices while spectators watch the battle unfold on a large screen.

## 🎮 Features

### Core Gameplay
- **Real-time multiplayer**: Multiple players can join simultaneously
- **Top-down shooter**: Tanks move, rotate, and shoot at each other
- **Attribute system**: Health, Speed, Gasoline, Rotation, Kinetics, and Ammunition
- **Upgrade system**: Collect power-ups to improve stats
- **AI opponents**: Smart AI tanks that hunt players and collect upgrades
- **Collision detection**: AABB-based collision system with trees and shells

### Player Features
- **Persistent player data**: Player settings saved in localStorage
- **Team system**: Choose between NATO, CSTO, and PLA teams
- **Customizable appearance**: 5 different tank colors
- **Touch controls**: Intuitive joystick and fire button interface
- **Real-time feedback**: Visual damage feedback and status updates

### Spectator Features
- **Live battlefield view**: Watch all players in real-time
- **Player list**: See all connected players and their status
- **AI controls**: Add/remove AI opponents with a button click
- **Balance panel**: Modify game parameters on the fly
- **Parameter export**: Copy game balance as JSON for sharing

## 🏗️ Architecture

### Server-Side
- **Express.js**: Web server and static file serving
- **Socket.io**: Real-time WebSocket communication
- **Game Engine**: 60 FPS game loop with physics and collision detection
- **AI System**: Weight-based decision tree for AI behavior

### Client-Side
- **Battlefield**: HTML5 Canvas rendering with real-time updates
- **Controller**: Touch-optimized mobile interface
- **WebSocket Client**: Real-time communication with server

### Shared
- **Game Constants**: Centralized game parameters and configurations
- **Type Definitions**: Shared data structures and classes
- **Collision Detection**: AABB collision utilities

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd tank-killer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Access the game**
   - Open `http://localhost:3000` in your browser
   - For battlefield view: `http://localhost:3000/battlefield`
   - For controller: `http://localhost:3000/controller`

### Development

```bash
npm run dev
```

## 🎯 How to Play

### For Players (Controller)
1. Open `/controller` on your mobile device
2. Enter your callname and choose tank color/team
3. Use the joystick to move your tank
4. Tap the fire button to shoot
5. Collect upgrades (S, G, R, A, K, H) to improve stats
6. Destroy enemy tanks to win!

### For Spectators (Battlefield)
1. Open `/battlefield` on a large screen
2. Watch the battle unfold in real-time
3. Use the AI button to add/remove AI opponents
4. Access balance panel to modify game parameters
5. Monitor player status in the player list

## 🎮 Game Mechanics

### Tank Attributes
- **Health** (0-100): When it reaches 0, tank respawns after 5 seconds
- **Speed** (5-50): Controls tank movement speed
- **Gasoline** (0-100): When empty, speed is reduced by 50%
- **Rotation** (5-50): Controls how fast the tank can turn
- **Ammunition** (0-14): Number of shots available
- **Kinetics** (50-300): Bullet speed

### Upgrades
- **S** (Speed): +20 speed points
- **G** (Gasoline): +80 gasoline points
- **R** (Rotation): +20 rotation points
- **A** (Ammunition): +7 ammunition
- **K** (Kinetics): +30 kinetics points
- **H** (Health): +10 health points

### Damage System
When hit by a bullet, tanks lose:
- 1 Health point
- 5 Speed points
- 5 Rotation points
- 10 Kinetics points
- 5 Gasoline points

### AI Behavior
- **Hunt Mode**: When health > 50%, AI seeks nearest enemy
- **Survival Mode**: When health < 50%, AI prioritizes upgrades
- **Smart Targeting**: AI aims and shoots at enemies within range
- **Resource Management**: AI collects upgrades based on needs

## 🔧 Configuration

### Game Parameters
All game parameters can be modified through the balance panel:

```json
{
  "gameParams": {
    "respawnTime": 5000,
    "reloadTime": 1000,
    "acceleration": 0.1,
    "bulletLifetime": 1000
  },
  "damageParams": {
    "health": 1,
    "speed": 5,
    "rotation": 5,
    "kinetics": 10,
    "gasoline": 5
  },
  "upgradeTypes": {
    "speed": { "count": 1 },
    "gasoline": { "count": 1 },
    "rotation": { "count": 1 },
    "ammunition": { "count": 2 },
    "kinetics": { "count": 1 },
    "health": { "count": 0 }
  }
}
```

## 📱 Mobile Optimization

The controller interface is optimized for mobile devices:
- Touch-friendly controls
- Responsive design
- Full-screen interface
- Prevented context menu on long press
- Optimized for portrait orientation

## 🌐 Network Architecture

- **WebSocket Communication**: Real-time bidirectional communication
- **Server Authority**: All game logic runs on the server
- **Client Prediction**: Smooth movement with server reconciliation
- **Automatic Reconnection**: Players can reconnect without losing data

## 🎨 Visual Design

- **Dark Theme**: Consistent #2F2F2F background
- **Color Coding**: Different colors for different attributes
- **Material Icons**: Clean, modern iconography
- **Smooth Animations**: CSS transitions and transforms
- **Bullet Trails**: Visual feedback for projectile movement

## 🔮 Future Enhancements

- [ ] Team-based gameplay mechanics
- [ ] Power-ups and special abilities
- [ ] Multiple maps and environments
- [ ] Sound effects and music
- [ ] Leaderboards and statistics
- [ ] Tournament mode
- [ ] Spectator chat
- [ ] Replay system

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Socket.io for real-time communication
- HTML5 Canvas for rendering
- Material Icons for UI elements
- Express.js for the web framework

---

**Enjoy the battle! 🚗💥** 