/**
 * Voice Assistant Screen - Main interaction interface
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  Alert,
  Vibration,
  Platform,
} from 'react-native';
import {
  Button,
  Card,
  FAB,
  Surface,
  ProgressBar,
  Chip,
  useTheme,
} from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Voice from '@react-native-voice/voice';
import * as Speech from 'expo-speech';

import { useVoice } from '../context/VoiceContext';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import WaveformVisualizer from '../components/WaveformVisualizer';
import ConversationLog from '../components/ConversationLog';
import QuickActions from '../components/QuickActions';
import PerformanceMetrics from '../components/PerformanceMetrics';

const { width, height } = Dimensions.get('window');

interface VoiceAssistantScreenProps {
  navigation: any;
}

const VoiceAssistantScreen: React.FC<VoiceAssistantScreenProps> = ({ navigation }) => {
  const theme = useTheme();
  const { user } = useAuth();
  const { isOnline, syncData } = useOffline();
  const {
    isListening,
    isProcessing,
    lastResponseTime,
    accuracy,
    startListening,
    stopListening,
    processQuery,
  } = useVoice();

  const [status, setStatus] = useState('Ready');
  const [recognizedText, setRecognizedText] = useState('');
  const [isWakeWordActive, setIsWakeWordActive] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);

  useEffect(() => {
    initializeVoice();
    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const initializeVoice = async () => {
    try {
      Voice.onSpeechStart = onSpeechStart;
      Voice.onSpeechRecognized = onSpeechRecognized;
      Voice.onSpeechEnd = onSpeechEnd;
      Voice.onSpeechError = onSpeechError;
      Voice.onSpeechResults = onSpeechResults;
      Voice.onSpeechPartialResults = onSpeechPartialResults;
    } catch (error) {
      console.error('Voice initialization failed:', error);
    }
  };

  const onSpeechStart = () => {
    setStatus('Listening...');
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Vibration.vibrate(50);
    }
  };

  const onSpeechRecognized = () => {
    setStatus('Processing...');
  };

  const onSpeechEnd = () => {
    setStatus('Ready');
  };

  const onSpeechError = (error: any) => {
    console.error('Speech error:', error);
    setStatus('Error occurred');
    if (Platform.OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      Vibration.vibrate([100, 50, 100]);
    }
  };

  const onSpeechResults = (event: any) => {
    const results = event.value;
    if (results && results.length > 0) {
      const text = results[0];
      setRecognizedText(text);
      handleVoiceInput(text);
    }
  };

  const onSpeechPartialResults = (event: any) => {
    const results = event.value;
    if (results && results.length > 0) {
      setRecognizedText(results[0]);
    }
  };

  const handleVoiceInput = async (text: string) => {
    const lowercaseText = text.toLowerCase();
    
    // Check for wake words
    if (lowercaseText.includes('jarvis') || lowercaseText.includes('hey jarvis')) {
      setIsWakeWordActive(true);
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Vibration.vibrate(100);
      }
      
      // Extract query after wake word
      const query = lowercaseText.replace(/^(hey\s+)?jarvis,?\s*/i, '').trim();
      if (query) {
        await processVoiceQuery(query);
      } else {
        speakResponse("I'm listening. How can I help you?");
      }
      
      setTimeout(() => setIsWakeWordActive(false), 2000);
    } else if (isWakeWordActive) {
      await processVoiceQuery(text);
    }
  };

  const processVoiceQuery = async (query: string) => {
    try {
      setStatus('Processing query...');
      const startTime = Date.now();
      
      // Add to conversation history
      const userEntry = {
        id: Date.now().toString(),
        type: 'user',
        message: query,
        timestamp: new Date(),
      };
      setConversationHistory(prev => [...prev, userEntry]);

      // Process query
      const response = await processQuery(query, user?.role);
      const responseTime = Date.now() - startTime;

      // Add response to history
      const assistantEntry = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        message: response.message,
        timestamp: new Date(),
        responseTime,
        confidence: response.confidence,
      };
      setConversationHistory(prev => [...prev, assistantEntry]);

      // Speak response
      speakResponse(response.message);
      
      setStatus(`Response: ${responseTime}ms`);
    } catch (error) {
      console.error('Query processing failed:', error);
      const errorMessage = "I'm sorry, I couldn't process that request. Please try again.";
      speakResponse(errorMessage);
      
      const errorEntry = {
        id: Date.now().toString(),
        type: 'error',
        message: errorMessage,
        timestamp: new Date(),
      };
      setConversationHistory(prev => [...prev, errorEntry]);
    }
  };

  const speakResponse = (text: string) => {
    Speech.speak(text, {
      language: user?.preferredLanguage || 'en-US',
      pitch: 1.0,
      rate: 0.9,
      onDone: () => {
        setStatus('Ready');
      },
      onError: (error) => {
        console.error('Speech synthesis error:', error);
      },
    });
  };

  const startVoiceListening = async () => {
    try {
      setRecognizedText('');
      await Voice.start('en-US');
    } catch (error) {
      console.error('Failed to start voice recognition:', error);
      Alert.alert('Error', 'Failed to start voice recognition');
    }
  };

  const stopVoiceListening = async () => {
    try {
      await Voice.stop();
    } catch (error) {
      console.error('Failed to stop voice recognition:', error);
    }
  };

  const handleQuickAction = (action: string) => {
    processVoiceQuery(action);
  };

  const clearConversation = () => {
    setConversationHistory([]);
    setRecognizedText('');
    setStatus('Ready');
  };

  const syncOfflineData = async () => {
    try {
      await syncData();
      Alert.alert('Success', 'Offline data synchronized successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to sync offline data');
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Status Header */}
      <Surface style={styles.statusHeader} elevation={2}>
        <View style={styles.statusRow}>
          <View style={styles.statusItem}>
            <Text style={[styles.statusLabel, { color: theme.colors.onSurfaceVariant }]}>
              Status
            </Text>
            <Text style={[styles.statusValue, { color: theme.colors.primary }]}>
              {status}
            </Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={[styles.statusLabel, { color: theme.colors.onSurfaceVariant }]}>
              Connection
            </Text>
            <Chip 
              icon={isOnline ? 'wifi' : 'wifi-off'} 
              mode="outlined"
              compact
            >
              {isOnline ? 'Online' : 'Offline'}
            </Chip>
          </View>
          <View style={styles.statusItem}>
            <Text style={[styles.statusLabel, { color: theme.colors.onSurfaceVariant }]}>
              User
            </Text>
            <Text style={[styles.statusValue, { color: theme.colors.primary }]}>
              {user?.name || 'Guest'}
            </Text>
          </View>
        </View>
        {!isOnline && (
          <Button 
            mode="outlined" 
            onPress={syncOfflineData}
            style={styles.syncButton}
          >
            Sync Data
          </Button>
        )}
      </Surface>

      {/* Voice Interface */}
      <Card style={styles.voiceCard}>
        <Card.Content>
          <WaveformVisualizer 
            isActive={isListening || isWakeWordActive}
            amplitude={isListening ? 0.8 : 0.2}
          />
          
          {isProcessing && (
            <ProgressBar 
              indeterminate 
              color={theme.colors.primary}
              style={styles.progressBar}
            />
          )}

          <Text style={[styles.recognizedText, { color: theme.colors.onSurface }]}>
            {recognizedText || "Say 'Jarvis' followed by your question"}
          </Text>

          <View style={styles.voiceControls}>
            <FAB
              icon={isListening ? 'microphone' : 'microphone-outline'}
              onPress={isListening ? stopVoiceListening : startVoiceListening}
              style={[
                styles.micButton,
                {
                  backgroundColor: isListening ? theme.colors.error : theme.colors.primary,
                },
              ]}
              size="large"
            />
          </View>
        </Card.Content>
      </Card>

      {/* Quick Actions */}
      <QuickActions 
        onAction={handleQuickAction}
        userRole={user?.role}
      />

      {/* Performance Metrics */}
      <PerformanceMetrics 
        responseTime={lastResponseTime}
        accuracy={accuracy}
        isOnline={isOnline}
      />

      {/* Conversation Log */}
      <ConversationLog 
        history={conversationHistory}
        onClear={clearConversation}
      />

      {/* Wake Word Indicator */}
      {isWakeWordActive && (
        <Surface style={styles.wakeWordIndicator} elevation={4}>
          <Ionicons 
            name="mic" 
            size={24} 
            color={theme.colors.primary} 
          />
          <Text style={[styles.wakeWordText, { color: theme.colors.primary }]}>
            Listening...
          </Text>
        </Surface>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  statusHeader: {
    padding: 16,
    marginBottom: 16,
    borderRadius: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusItem: {
    alignItems: 'center',
    flex: 1,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  syncButton: {
    marginTop: 8,
  },
  voiceCard: {
    marginBottom: 16,
    borderRadius: 16,
  },
  progressBar: {
    marginVertical: 16,
    height: 4,
    borderRadius: 2,
  },
  recognizedText: {
    fontSize: 18,
    textAlign: 'center',
    marginVertical: 20,
    minHeight: 50,
    fontStyle: 'italic',
  },
  voiceControls: {
    alignItems: 'center',
    marginVertical: 20,
  },
  micButton: {
    width: 80,
    height: 80,
  },
  wakeWordIndicator: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    padding: 16,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  wakeWordText: {
    marginLeft: 8,
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default VoiceAssistantScreen;
