/**
 * Mock Data - Stories
 * Centralized ephemeral stories data for social features
 */

export interface Story {
  id: number;
  type: 'photo' | 'video';
  url: string;
  thumbnail?: string;
  caption?: string;
  timestamp: string;
  author: {
    name: string;
    avatar?: string;
    isHost: boolean;
  };
  venue?: {
    id: number;
    name: string;
  };
  stickers?: string[];
  views?: number;
  expiresAt: string;
}

export interface StoryGroup {
  id: number;
  name: string;
  avatar?: string;
  isHost: boolean;
  venueId?: number;
  stories: Story[];
  hasUnviewed: boolean;
}

export const storyGroups: StoryGroup[] = [
  {
    id: 1,
    name: 'The Rooftop',
    avatar: 'https://images.unsplash.com/photo-1623630524058-622b7fa9ecd7?w=200',
    isHost: true,
    venueId: 1,
    hasUnviewed: true,
    stories: [
      {
        id: 1,
        type: 'photo' as const,
        url: 'https://images.unsplash.com/photo-1623630524058-622b7fa9ecd7?w=1080',
        caption: 'Happy Hour starts now! 🍹',
        timestamp: '5m ago',
        author: {
          name: 'The Rooftop',
          avatar: 'https://images.unsplash.com/photo-1623630524058-622b7fa9ecd7?w=200',
          isHost: true,
        },
        venue: {
          id: 1,
          name: 'The Rooftop',
        },
        stickers: ['Love it!', 'Fire!'],
        views: 324,
        expiresAt: new Date(Date.now() + 19 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 2,
        type: 'photo' as const,
        url: 'https://images.unsplash.com/photo-1569402814755-b35b04017cab?w=1080',
        caption: 'Signature cocktails on point!',
        timestamp: '15m ago',
        author: {
          name: 'The Rooftop',
          avatar: 'https://images.unsplash.com/photo-1623630524058-622b7fa9ecd7?w=200',
          isHost: true,
        },
        venue: {
          id: 1,
          name: 'The Rooftop',
        },
        stickers: ['Amazing'],
        views: 287,
        expiresAt: new Date(Date.now() + 19 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
  {
    id: 2,
    name: 'Neon District',
    avatar: 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=200',
    isHost: true,
    venueId: 2,
    hasUnviewed: true,
    stories: [
      {
        id: 3,
        type: 'video' as const,
        url: 'https://images.unsplash.com/photo-1470229538611-16a3474e0197?w=1080',
        caption: 'DJ set heating up! 🔥',
        timestamp: '1h ago',
        author: {
          name: 'Neon District',
          avatar: 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=200',
          isHost: true,
        },
        venue: {
          id: 2,
          name: 'Neon District',
        },
        stickers: ['Fire!', 'Love it!'],
        views: 542,
        expiresAt: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
  {
    id: 3,
    name: 'Sarah M.',
    isHost: false,
    hasUnviewed: true,
    stories: [
      {
        id: 4,
        type: 'photo' as const,
        url: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=1080',
        caption: 'Vibing at Neon District tonight!',
        timestamp: '2h ago',
        author: {
          name: 'Sarah M.',
          isHost: false,
        },
        venue: {
          id: 2,
          name: 'Neon District',
        },
        stickers: ['Amazing'],
        views: 156,
        expiresAt: new Date(Date.now() + 21 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
  {
    id: 4,
    name: 'Mike R.',
    isHost: false,
    hasUnviewed: false,
    stories: [
      {
        id: 5,
        type: 'photo' as const,
        url: 'https://images.unsplash.com/photo-1759419038843-29749ac4cd2d?w=1080',
        caption: 'Dinner at Urban Bistro was amazing!',
        timestamp: '5h ago',
        author: {
          name: 'Mike R.',
          isHost: false,
        },
        venue: {
          id: 4,
          name: 'Urban Bistro',
        },
        stickers: ['Love it!'],
        views: 67,
        expiresAt: new Date(Date.now() + 19 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
];
