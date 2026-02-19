# Poker Tournament Scheduler

A comprehensive web application for managing and scheduling poker tournaments with PDF parsing, user accounts, shared schedules, and real-time countdowns.

## Features

### Core Functionality
- **PDF Upload & Parsing**: Upload tournament schedule PDFs (WSOP, WPT, etc.) and automatically extract tournament details
- **Smart Filtering**: Filter tournaments by buy-in range, game variant, venue, and dates
- **User Accounts**: Secure authentication with JWT tokens
- **Personal Schedules**: Add tournaments to your personal schedule
- **Shared Permissions**: Grant other users view access to your schedule
- **Daily Calendar**: View today's tournaments with live countdowns
- **Late Registration Tracking**: Monitor late registration periods and remaining time

### Game Variants Supported
- No-Limit Hold'em (NLHE)
- Pot-Limit Omaha (PLO)
- Omaha Hi-Lo
- H.O.R.S.E.
- 2-7 Triple Draw
- 7 Card Stud
- Razz
- Badugi
- Big O
- Mixed Games
- Dealers Choice
- And more!

## Installation

### Prerequisites
- Node.js 14+ 
- npm or yarn

### Setup

1. **Navigate to the project directory**:
```bash
cd poker-tournament-app
```

2. **Install dependencies** (already done):
```bash
npm install
```

3. **Start the server**:
```bash
npm start
```

The server will start on http://localhost:3001

4. **Open the web app**:
Open `public/index.html` in your browser, or serve it with a simple HTTP server:

```bash
# Option 1: Using Python
cd public
python3 -m http.server 8000

# Option 2: Using Node's http-server (install globally first)
npm install -g http-server
cd public
http-server -p 8000
```

Then visit http://localhost:8000

## Usage

### 1. Create an Account
- Click "Register" on the login screen
- Enter username, email, and password
- After registration, log in with your credentials

### 2. Upload Tournament Schedules
- Go to the "Upload Schedule" tab
- Click "Choose PDF File"
- Select a tournament schedule PDF (like the WSOP schedule)
- The app will automatically parse and add tournaments to the database

### 3. Filter Tournaments
- Use the filter controls to narrow down tournaments:
  - Min/Max Buy-in
  - Game Variant (NLHE, PLO, Mixed Games, etc.)
  - Venue
- Filters update the tournament list in real-time

### 4. Build Your Schedule
- Browse the "All Tournaments" tab
- Click "Add to Schedule" on tournaments you want to play
- View your complete schedule in the "My Schedule" tab

### 5. Daily Calendar
- Check the "Daily Calendar" tab to see today's events
- View live countdowns until tournament start times
- Monitor late registration status

### 6. Share Schedules (Coming Soon)
- Grant permission to friends to view your schedule
- View schedules of users who have granted you access

## PDF Parsing

The app includes parsers for common tournament schedule formats:

- **WSOP Format**: Automatically extracts event numbers, dates, times, buy-ins, game variants
- **Custom Formats**: The parser can be extended for other tournament series

### PDF Requirements
PDFs should include:
- Tournament dates and times
- Buy-in amounts
- Event names/descriptions
- Game variants (for proper classification)

## Database Schema

### Users
- id, username, email, password (hashed), created_at

### Tournaments
- id, event_number, event_name, date, time, buyin, starting_chips
- level_duration, reentry, late_reg, game_variant, venue
- structure_sheet_path, source_pdf, uploaded_by, created_at

### User Schedules
- Links users to tournaments they've added to their schedule

### Schedule Permissions
- Manages which users can view each other's schedules

## API Endpoints

### Authentication
- `POST /api/register` - Create new user account
- `POST /api/login` - Login and receive JWT token

### Tournaments
- `GET /api/tournaments` - Get all tournaments (with filters)
- `POST /api/upload-schedule` - Upload and parse PDF schedule
- `GET /api/game-variants` - Get list of available game variants
- `GET /api/venues` - Get list of available venues

### Schedules
- `GET /api/my-schedule` - Get current user's schedule
- `POST /api/schedule` - Add tournament to schedule
- `DELETE /api/schedule/:tournamentId` - Remove tournament from schedule
- `GET /api/schedule/:userId` - Get another user's schedule (if permitted)

### Permissions
- `POST /api/permissions` - Grant schedule view permission
- `GET /api/shared-schedules` - Get list of users who shared with you

## Tech Stack

### Backend
- **Node.js** with Express
- **sql.js** - Pure JavaScript SQLite database
- **bcryptjs** - Password hashing
- **jsonwebtoken** - JWT authentication
- **pdf-parse** - PDF text extraction
- **multer** - File upload handling

### Frontend
- **React** (via CDN for simplicity)
- **Vanilla CSS** with modern gradients and animations
- **No build process** - just open the HTML file

## Customization

### Adding New Game Variants
The parser automatically classifies games based on keywords in event names. To add support for new variants, update the `parseWSOP2025Schedule` function in `server.js`.

### Styling
All styles are in `public/index.html` in the `<style>` tag. The color scheme uses:
- Primary: #4ecca3 (green)
- Secondary: #e94560 (red)
- Background: #1a1a2e (dark blue)
- Cards: #0f3460 (medium blue)

### Enhancing the PDF Parser
For tournament series with different PDF formats, create new parser functions following the pattern of `parseWSOP2025Schedule`.

## Future Enhancements

### Planned Features
1. **Structure Sheet Upload**: Upload individual tournament structures for accurate late reg calculations
2. **Advanced Countdown Logic**: Calculate exact late registration end times based on structure sheets
3. **Mobile App**: React Native version for iOS/Android
4. **Push Notifications**: Alerts before tournaments start
5. **Bankroll Tracking**: Integrate with results tracking
6. **Calendar Export**: Export schedule to Google Calendar, iCal
7. **Social Features**: Comments, ratings, strategy notes on tournaments
8. **Multi-Series Support**: Dedicated parsers for WPT, EPT, etc.
9. **Live Updates**: Real-time late reg status from venue APIs
10. **Satellite Paths**: Track satellite opportunities for higher buy-ins

### Production Deployment
For production use:
1. Replace JWT_SECRET with a strong random key
2. Use PostgreSQL instead of SQLite
3. Add HTTPS/SSL
4. Implement rate limiting
5. Add comprehensive error logging
6. Use environment variables for configuration
7. Deploy backend to a service like Heroku, Railway, or AWS
8. Deploy frontend to Netlify, Vercel, or Cloudflare Pages

## Contributing

To extend the parser for additional tournament series:
1. Examine the PDF structure
2. Create a new parser function following the existing patterns
3. Test with sample PDFs
4. Update the upload endpoint to detect and use the appropriate parser

## License

MIT License - Feel free to use and modify for your poker community!

## Support

For issues or questions:
- Check the console for error messages
- Verify the backend is running on port 3001
- Ensure PDFs are text-based (not scanned images)
- Try different PDF formats if parsing fails

---

Built with ♠️ for the poker community
