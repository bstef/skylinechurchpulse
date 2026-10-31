import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '../../src/ThemeContext.tsx';

// Emoji match the cards on the website's home page.
const icon = (glyph: string) => ({ focused }: { focused: boolean }) => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.6 }}>{glyph}</Text>;

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.ink,
      headerShadowVisible: false,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
      tabBarActiveTintColor: colors.brass,
      tabBarInactiveTintColor: colors.muted,
      sceneStyle: { backgroundColor: colors.paper },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="services" options={{ title: 'Services', tabBarIcon: icon('🗓️') }} />
      <Tabs.Screen name="production" options={{ title: 'Production', tabBarIcon: icon('🎛️') }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: icon('📅') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('⚙️') }} />
    </Tabs>
  );
}
