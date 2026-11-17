import { Tabs } from 'expo-router';
import React, { useMemo } from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColors } from '@/hooks/use-theme';

export default function TabLayout() {
  const colors = useThemeColors();

  const tabStyle = useMemo(
    () => ({
      backgroundColor: colors.background,
      borderTopColor: colors.border,
    }),
    [colors]
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: tabStyle,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={28}
              name="square.grid.2x2"
              color={typeof color === 'number' ? colors.primary : (color ?? colors.primary)}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={28}
              name="list.bullet"
              color={typeof color === 'number' ? colors.primary : (color ?? colors.primary)}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={28}
              name="cart"
              color={typeof color === 'number' ? colors.primary : (color ?? colors.primary)}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color }) => (
            <IconSymbol
              size={28}
              name="ellipsis"
              color={typeof color === 'number' ? colors.primary : (color ?? colors.primary)}
            />
          ),
        }}
      />
    </Tabs>
  );
}
