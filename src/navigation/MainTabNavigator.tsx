/**
 * Tori Wallet - Main Tab Navigator
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTheme } from 'styled-components/native';
import styled from 'styled-components/native';

import HomeScreen from '@/screens/Home/HomeScreen';
import ExploreScreen from '@/screens/Explore/ExploreScreen';
import PortfolioScreen from '@/screens/Portfolio/PortfolioScreen';
import ActivityScreen from '@/screens/Activity/ActivityScreen';
import SettingsScreen from '@/screens/Settings/SettingsScreen';

export type MainTabParamList = {
  Home: undefined;
  Explore: undefined;
  Portfolio: undefined;
  Activity: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

// 탭 아이콘 스타일 - 심플한 라인 아이콘
const TabIconText = styled.Text<{ $focused: boolean; $color: string }>`
  font-size: 22px;
  color: ${({ $color }) => $color};
  margin-bottom: 2px;
`;

// 아이콘 렌더링 함수들 (심플한 유니코드 심볼)
const renderHomeIcon = ({
  focused,
  color,
}: {
  focused: boolean;
  color: string;
}) => (
  <TabIconText $focused={focused} $color={color}>
    ⌂
  </TabIconText>
);

const renderExploreIcon = ({
  focused,
  color,
}: {
  focused: boolean;
  color: string;
}) => (
  <TabIconText $focused={focused} $color={color}>
    ◎
  </TabIconText>
);

const renderPortfolioIcon = ({
  focused,
  color,
}: {
  focused: boolean;
  color: string;
}) => (
  <TabIconText $focused={focused} $color={color}>
    ◐
  </TabIconText>
);

const renderActivityIcon = ({
  focused,
  color,
}: {
  focused: boolean;
  color: string;
}) => (
  <TabIconText $focused={focused} $color={color}>
    ☰
  </TabIconText>
);

const renderSettingsIcon = ({
  focused,
  color,
}: {
  focused: boolean;
  color: string;
}) => (
  <TabIconText $focused={focused} $color={color}>
    ⚙
  </TabIconText>
);

function MainTabNavigator(): React.JSX.Element {
  const theme = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.backgroundSecondary,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          paddingTop: 10,
          paddingBottom: 10,
          height: 85,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginTop: 4,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: '홈',
          tabBarIcon: renderHomeIcon,
        }}
      />
      <Tab.Screen
        name="Explore"
        component={ExploreScreen}
        options={{
          tabBarLabel: '탐색',
          tabBarIcon: renderExploreIcon,
        }}
      />
      <Tab.Screen
        name="Portfolio"
        component={PortfolioScreen}
        options={{
          tabBarLabel: '포트폴리오',
          tabBarIcon: renderPortfolioIcon,
        }}
      />
      <Tab.Screen
        name="Activity"
        component={ActivityScreen}
        options={{
          tabBarLabel: '활동',
          tabBarIcon: renderActivityIcon,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: '설정',
          tabBarIcon: renderSettingsIcon,
        }}
      />
    </Tab.Navigator>
  );
}

export default MainTabNavigator;
