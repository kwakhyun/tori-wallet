/**
 * 메인 탭 네비게이터
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTheme } from 'styled-components/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HomeScreen from '@/screens/Home/HomeScreen';
import ExploreScreen from '@/screens/Explore/ExploreScreen';
import PortfolioScreen from '@/screens/Portfolio/PortfolioScreen';
import ActivityScreen from '@/screens/Activity/ActivityScreen';
import SettingsScreen from '@/screens/Settings/SettingsScreen';
import {
  HomeIcon,
  ExploreIcon,
  PortfolioIcon,
  ActivityIcon,
  SettingsIcon,
} from '@/components/icons';

export type MainTabParamList = {
  Home: undefined;
  Explore: undefined;
  Portfolio: undefined;
  Activity: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

// 아이콘 크기
const ICON_SIZE = 24;

// 아이콘 렌더링 함수들 (모던 SVG 아이콘)
const renderHomeIcon = ({
  focused,
  color,
}: {
  focused: boolean;
  color: string;
}) => <HomeIcon size={ICON_SIZE} color={color} focused={focused} />;

const renderExploreIcon = ({
  focused,
  color,
}: {
  focused: boolean;
  color: string;
}) => <ExploreIcon size={ICON_SIZE} color={color} focused={focused} />;

const renderPortfolioIcon = ({
  focused,
  color,
}: {
  focused: boolean;
  color: string;
}) => <PortfolioIcon size={ICON_SIZE} color={color} focused={focused} />;

const renderActivityIcon = ({
  focused,
  color,
}: {
  focused: boolean;
  color: string;
}) => <ActivityIcon size={ICON_SIZE} color={color} focused={focused} />;

const renderSettingsIcon = ({
  focused,
  color,
}: {
  focused: boolean;
  color: string;
}) => <SettingsIcon size={ICON_SIZE} color={color} focused={focused} />;

function MainTabNavigator(): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // 홈 인디케이터/제스처 바 높이를 반영한다 (고정 높이 85는 기기마다 겹치거나 남음)
  const bottomPadding = Math.max(insets.bottom, 8);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.backgroundSecondary,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: 56 + bottomPadding,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginTop: 2,
        },
        tabBarAllowFontScaling: true,
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
