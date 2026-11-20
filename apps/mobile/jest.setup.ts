// Mock AsyncStorage for Jest tests
const mockStorage: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => (key in mockStorage ? mockStorage[key] : null)),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStorage[key] = value;
    }),
    removeItem: jest.fn(async (key: string) => {
      delete mockStorage[key];
    }),
    clear: jest.fn(async () => {
      for (const k of Object.keys(mockStorage)) {
        delete mockStorage[k];
      }
    }),
  },
}));

jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
}));

jest.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
    setAudioModeAsync: jest.fn(async () => undefined),
    Recording: {
      createAsync: jest.fn(async () => ({
        recording: {
          stopAndUnloadAsync: jest.fn(async () => undefined),
          getURI: jest.fn(() => 'file:///mock/recording.m4a'),
        },
      })),
    },
    RecordingOptionsPresets: {
      HIGH_QUALITY: {},
    },
  },
}));

// Mock expo-secure-store with an in-memory keychain, exposed for assertions.
const mockSecureStore: Record<string, string> = {};
(globalThis as unknown as { __mockSecureStore: Record<string, string> }).__mockSecureStore = mockSecureStore;
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => (key in mockSecureStore ? mockSecureStore[key] : null)),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore[key] = value;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete mockSecureStore[key];
  }),
}));
