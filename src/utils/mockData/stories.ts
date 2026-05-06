/** Ephemeral story types and empty production seed. */

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

export const storyGroups: StoryGroup[] = [];