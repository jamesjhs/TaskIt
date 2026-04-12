const ADJECTIVES = [
  'Able', 'Active', 'Agile', 'Apt', 'Avid',
  'Bold', 'Brave', 'Bright', 'Brisk', 'Buoyant',
  'Calm', 'Capable', 'Cheerful', 'Clear', 'Clever',
  'Daring', 'Dazzling', 'Dynamic', 'Eager', 'Earnest',
  'Elite', 'Energetic', 'Epic', 'Excellent', 'Expert',
  'Fair', 'Fast', 'Fine', 'Firm', 'Focused',
  'Free', 'Fresh', 'Gifted', 'Glad', 'Glowing',
  'Golden', 'Good', 'Grand', 'Great', 'Hardy',
  'Happy', 'Helpful', 'Hopeful', 'Inspiring', 'Joyful',
  'Keen', 'Kind', 'Lively', 'Loyal', 'Lucky',
  'Mighty', 'Noble', 'Open', 'Positive', 'Proud',
  'Quick', 'Radiant', 'Ready', 'Resilient', 'Sharp',
  'Skilled', 'Smart', 'Spirited', 'Strong', 'Sure',
  'Swift', 'Talented', 'Tenacious', 'Trusted', 'Vibrant',
  'Vital', 'Warm', 'Wise', 'Witty', 'Zealous',
];

const VERBS = [
  'Achieve', 'Advance', 'Aspire', 'Bloom', 'Boost',
  'Build', 'Celebrate', 'Charge', 'Create', 'Dare',
  'Deliver', 'Drive', 'Elevate', 'Empower', 'Enable',
  'Engage', 'Excel', 'Explore', 'Flourish', 'Focus',
  'Forge', 'Grow', 'Guide', 'Ignite', 'Improve',
  'Inspire', 'Launch', 'Lead', 'Learn', 'Leap',
  'Move', 'Pioneer', 'Plan', 'Progress', 'Reach',
  'Rise', 'Run', 'Shine', 'Soar', 'Spark',
  'Sprint', 'Strive', 'Succeed', 'Surge', 'Thrive',
  'Transform', 'Unite', 'Unlock', 'Uplift', 'Win',
];

// Positive, easy-to-remember words of 5–8 letters
const PASSWORD_WORDS = [
  'amber', 'bliss', 'bloom', 'brave', 'breeze',
  'bright', 'bronze', 'cheer', 'cherry', 'clarity',
  'cloud', 'coral', 'courage', 'crisp', 'daring',
  'delight', 'dream', 'energy', 'excel', 'faith',
  'flame', 'flair', 'flint', 'float', 'focus',
  'forest', 'fresh', 'gently', 'ginger', 'glade',
  'gleam', 'glint', 'glitter', 'glory', 'golden',
  'grace', 'grant', 'green', 'grove', 'guide',
  'haven', 'heart', 'herbal', 'hilltop', 'honey',
  'hope', 'ignite', 'island', 'jasper', 'joyful',
  'jumper', 'kindle', 'lancer', 'lively', 'loyal',
  'lucky', 'maple', 'marvel', 'meadow', 'merit',
  'mighty', 'mingle', 'novel', 'oasis', 'ocean',
  'onward', 'orange', 'outrun', 'peace', 'petal',
  'pillar', 'pine', 'plume', 'power', 'prism',
  'pure', 'quest', 'quilt', 'radiant', 'rally',
  'ranger', 'rapid', 'reach', 'ready', 'revel',
  'ridge', 'river', 'roam', 'rover', 'royal',
  'ruby', 'rustle', 'sage', 'serene', 'shimmer',
  'silver', 'slate', 'solar', 'sonar', 'spark',
  'spirit', 'spring', 'spry', 'star', 'steel',
  'stone', 'stream', 'stride', 'strong', 'summit',
  'sunny', 'swift', 'tender', 'thrive', 'timber',
  'topaz', 'torch', 'tower', 'trail', 'trust',
  'uplift', 'valor', 'vivid', 'voyage', 'warm',
  'waves', 'willow', 'wisdom', 'wonder', 'worthy',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateGroupName(): string {
  return pick(ADJECTIVES) + ' ' + pick(VERBS);
}

export function generateSharedKey(): string {
  return pick(PASSWORD_WORDS);
}
