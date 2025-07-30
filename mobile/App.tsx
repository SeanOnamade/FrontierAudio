/**
 * JARVIS Mobile App - Airport Operations Voice Assistant
 * React Native/Expo implementation for iOS and Android
 */

import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider as PaperProvider, MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';

// Screens
import VoiceAssistantScreen from './src/screens/VoiceAssistantScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import OfflineDataScreen from './src/screens/OfflineDataScreen';
import WearableScreen from './src/screens/WearableScreen';

// Context providers
import { AuthProvider } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { VoiceProvider } from './src/context/VoiceContext';
import { OfflineProvider } from './src/context/OfflineContext';

// Services
import { initializeDatabase } from './src/services/DatabaseService';
import { initializeNotifications } from './src/services/NotificationService';
import { initializeBiometrics } from './src/services/BiometricService';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Main tab navigator
function MainTabs() {
  const { theme } = useTheme();
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          if (route.name === 'Voice') {
            iconName = focused ? 'mic' : 'mic-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          } else if (route.name === 'Data') {
            iconName = focused ? 'cloud-download' : 'cloud-download-outline';
          } else if (route.name === 'Wearable') {
            iconName = focused ? 'watch' : 'watch-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          } else {
            iconName = 'help-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outline,
        },
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerTintColor: theme.colors.onSurface,
      })}
    >
      <Tab.Screen 
        name="Voice" 
        component={VoiceAssistantScreen}
        options={{
          title: 'JARVIS',
          headerTitle: '🛫 JARVIS Voice Assistant'
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
      <Tab.Screen 
        name="Data" 
        component={OfflineDataScreen}
        options={{ title: 'Offline Data' }}
      />
      <Tab.Screen 
        name="Wearable" 
        component={WearableScreen}
        options={{ title: 'Wearable' }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Tab.Navigator>
  );
}

// App component with providers
function AppContent() {
  const { theme, isDarkMode } = useTheme();
  const [isReady, setIsReady] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize database
      await initializeDatabase();
      
      // Initialize notifications
      await initializeNotifications();
      
      // Check biometric authentication
      const biometricAuth = await initializeBiometrics();
      setAuthRequired(biometricAuth.required);
      
      setIsReady(true);
    } catch (error) {
      console.error('Failed to initialize app:', error);
      setIsReady(true); // Continue even if some services fail
    }
  };

  const paperTheme = isDarkMode ? MD3DarkTheme : MD3LightTheme;

  if (!isReady) {
    return null; // Add a proper loading screen here
  }

  return (
    <PaperProvider theme={paperTheme}>
      <NavigationContainer>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <MainTabs />
      </NavigationContainer>
    </PaperProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <VoiceProvider>
          <OfflineProvider>
            <AppContent />
          </OfflineProvider>
        </VoiceProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
