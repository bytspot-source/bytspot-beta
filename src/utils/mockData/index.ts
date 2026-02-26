/**
 * Mock Data - Central Export
 * 
 * Centralized mock data for the entire Bytspot application.
 * Import from here to keep data consistent across components.
 * 
 * Usage:
 * import { discoverCards, storyGroups } from './utils/mockData';
 */

// Discover Cards (Parking, Venues, Valet, etc.)
export { discoverCards, type DiscoverCard, type CardType } from './discover';

// Stories (Ephemeral social content)
export { storyGroups, type Story, type StoryGroup } from './stories';

// Host Dashboard Data
export * from '../hostMockData';

// Valet Driver Data
export * from '../valetMockData';
