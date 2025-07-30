# JARVIS Mobile App

Cross-platform mobile application for the JARVIS Airport Operations Voice Assistant.

## Features

### 🎯 Core Functionality
- **Voice Recognition**: Advanced speech-to-text with wake word detection
- **Offline Capabilities**: Full functionality without internet connection
- **Role-Based Access**: Personalized experience based on user role
- **Real-time Sync**: Automatic data synchronization when online
- **Biometric Security**: Face ID, Touch ID, and fingerprint authentication

### 📱 Platform Support
- **iOS**: Native iOS app with full feature support
- **Android**: Native Android app with offline capabilities
- **Wearable**: Apple Watch and Wear OS companion apps
- **Accessibility**: Full screen reader and voice control support

### 🎨 User Experience
- **Adaptive Themes**: Light, dark, and high contrast modes
- **Haptic Feedback**: Tactile responses for better interaction
- **Voice Feedback**: Audio confirmation and responses
- **Gesture Support**: Swipe, pinch, and touch gestures
- **Quick Actions**: Shortcut buttons for common tasks

## Installation

### Prerequisites
- Node.js 16+ and npm/yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator
- Physical device for testing (recommended)

### Setup
```bash
# Clone repository
git clone <repository-url>
cd mobile

# Install dependencies
npm install

# Start development server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android
```

### Building for Production
```bash
# Build for iOS
expo build:ios

# Build for Android
expo build:android
```

## Architecture

### Technology Stack
- **Framework**: React Native with Expo
- **Navigation**: React Navigation 6
- **UI Library**: React Native Paper (Material Design 3)
- **State Management**: React Context + Hooks
- **Database**: SQLite with Expo SQLite
- **Voice**: React Native Voice + Expo Speech
- **Storage**: AsyncStorage for preferences
- **Authentication**: Expo Local Authentication

### Project Structure
```
src/
├── components/          # Reusable UI components
│   ├── WaveformVisualizer.tsx
│   ├── ConversationLog.tsx
│   ├── QuickActions.tsx
│   └── PerformanceMetrics.tsx
├── context/            # React context providers
│   ├── AuthContext.tsx
│   ├── ThemeContext.tsx
│   ├── VoiceContext.tsx
│   └── OfflineContext.tsx
├── screens/            # App screens
│   ├── VoiceAssistantScreen.tsx
│   ├── SettingsScreen.tsx
│   ├── ProfileScreen.tsx
│   ├── OfflineDataScreen.tsx
│   └── WearableScreen.tsx
├── services/           # Business logic services
│   ├── DatabaseService.ts
│   ├── VoiceService.ts
│   ├── SyncService.ts
│   ├── BiometricService.ts
│   └── NotificationService.ts
├── utils/              # Helper functions
│   ├── permissions.ts
│   ├── storage.ts
│   └── constants.ts
└── types/              # TypeScript definitions
    ├── auth.ts
    ├── database.ts
    └── voice.ts
```

## Key Components

### Voice Assistant Screen
Main interface for voice interactions with JARVIS:
- Real-time waveform visualization
- Wake word detection ("Jarvis", "Hey Jarvis")
- Speech-to-text processing
- Response synthesis
- Conversation history
- Quick action buttons

### User Profile Management
Complete user personalization system:
- Role-based access control (Ramp Worker, Supervisor, etc.)
- Custom preferences and settings
- Biometric authentication setup
- Language and accessibility options

### Offline Data Management
Robust offline capabilities:
- SQLite database synchronization
- Cached query responses
- Priority-based sync queue
- Network status monitoring

### Settings & Accessibility
Comprehensive accessibility features:
- Theme customization (light/dark/high contrast)
- Font size and contrast adjustment
- Voice feedback controls
- Gesture sensitivity settings
- Screen reader optimization

## User Roles

### Ramp Worker
- Flight status queries
- Equipment location tracking
- Basic operational information
- Safety protocol access

### Supervisor
- Staff management tools
- Operational overviews
- Performance metrics
- Task assignment capabilities

### Maintenance Crew
- Equipment status monitoring
- Maintenance schedules
- Safety inspection checklists
- Technical documentation

### Baggage Handler
- Baggage tracking systems
- Loading schedules
- Cargo information
- Transfer protocols

### Operations Manager
- Comprehensive reporting
- System analytics
- All-access permissions
- Emergency coordination

## Voice Commands

### Basic Commands
```
"Jarvis, what is the status of flight UA2406?"
"Hey Jarvis, where is pushback tractor T-42?"
"Jarvis, show me my current tasks"
"Hey Jarvis, what's the weather status?"
```

### Role-Specific Commands
```
# Supervisor
"Jarvis, show staff assignments for gate A12"
"Hey Jarvis, generate shift report"

# Maintenance
"Jarvis, when is the next inspection for equipment E-201?"
"Hey Jarvis, show safety checklist for today"

# Baggage Handler
"Jarvis, what's the baggage status for flight AA1234?"
"Hey Jarvis, show loading schedule"
```

## Customization

### Adding New Voice Commands
1. Update `VoiceService.ts` with new command patterns
2. Add corresponding database queries
3. Update role permissions if needed
4. Test with voice recognition

### Custom Themes
1. Modify theme objects in `ThemeContext.tsx`
2. Add new color schemes
3. Update component styles
4. Test accessibility compliance

### New User Roles
1. Define role in `AuthContext.tsx`
2. Set permissions and access levels
3. Create role-specific quick actions
4. Update UI for new role workflows

## Testing

### Unit Testing
```bash
npm test
```

### E2E Testing
```bash
# Install Detox (iOS/Android E2E testing)
npm install -g detox-cli
npm run e2e:build
npm run e2e:test
```

### Accessibility Testing
- Use VoiceOver (iOS) and TalkBack (Android)
- Test keyboard navigation
- Verify contrast ratios
- Test with voice control

## Deployment

### App Store (iOS)
1. Build with `expo build:ios`
2. Upload to App Store Connect
3. Configure metadata and screenshots
4. Submit for review

### Google Play (Android)
1. Build with `expo build:android`
2. Upload to Google Play Console
3. Configure store listing
4. Release to production

### Enterprise Distribution
- Use Expo for internal distribution
- Configure over-the-air updates
- Set up crash reporting
- Monitor usage analytics

## Security

### Data Protection
- All sensitive data encrypted at rest
- Secure communication with backend
- Biometric authentication required
- Automatic session timeout

### Privacy Compliance
- GDPR compliant data handling
- User consent for data collection
- Right to data deletion
- Transparent privacy policies

## Performance

### Optimization
- Lazy loading of components
- Image and asset optimization
- Database query optimization
- Memory usage monitoring

### Monitoring
- Crash reporting with Sentry
- Performance metrics tracking
- User behavior analytics
- Voice recognition accuracy metrics

## Support

### Technical Issues
- Check device compatibility
- Verify permissions (microphone, storage)
- Update to latest version
- Clear app cache if needed

### Voice Recognition Issues
- Ensure quiet environment
- Check microphone permissions
- Calibrate voice recognition
- Use clear pronunciation

## Contributing

1. Fork the repository
2. Create feature branch
3. Implement changes with tests
4. Ensure accessibility compliance
5. Submit pull request

## License

MIT License - See LICENSE file for details

---

**Built for Airport Operations Excellence**
Making aviation safer and more efficient through voice technology.
