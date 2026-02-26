import { InsiderStoriesHub } from './InsiderStoriesHub';

interface InsiderSectionProps {
  isDarkMode: boolean;
}

export function InsiderSection({ isDarkMode }: InsiderSectionProps) {
  return <InsiderStoriesHub isDarkMode={isDarkMode} />;
}
