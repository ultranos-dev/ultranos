import type { NavigatorScreenParams } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

// --- Stack param lists per tab ---

export type HomeStackParamList = {
  HomeScreen: undefined
  PrescriptionDetailScreen: { prescriptionId: string }
  QRFullScreen: undefined
  SubscriptionScreen: undefined
}

export type TimelineStackParamList = {
  TimelineScreen: undefined
  EncounterDetailScreen: { encounterId: string }
  AllergyDetailScreen: { allergyId: string }
}

export type PrivacyStackParamList = {
  PrivacySettingsScreen: undefined
  GuardianLinkScreen: undefined
  ExportScreen: undefined
}

export type NotificationsStackParamList = {
  NotificationsScreen: undefined
  NotificationDetailScreen: { notificationId: string }
}

// --- Root tab param list ---

export type RootTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>
  TimelineTab: NavigatorScreenParams<TimelineStackParamList>
  PrivacyTab: NavigatorScreenParams<PrivacyStackParamList>
  NotificationsTab: NavigatorScreenParams<NotificationsStackParamList>
}

// --- Screen prop helpers ---

export type HomeStackScreenProps<T extends keyof HomeStackParamList> =
  NativeStackScreenProps<HomeStackParamList, T>

export type TimelineStackScreenProps<T extends keyof TimelineStackParamList> =
  NativeStackScreenProps<TimelineStackParamList, T>

export type PrivacyStackScreenProps<T extends keyof PrivacyStackParamList> =
  NativeStackScreenProps<PrivacyStackParamList, T>

export type NotificationsStackScreenProps<T extends keyof NotificationsStackParamList> =
  NativeStackScreenProps<NotificationsStackParamList, T>
