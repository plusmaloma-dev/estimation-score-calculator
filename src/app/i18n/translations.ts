export const translations = {
  en: {
    appName: 'Estimation',
    startNewGame: 'Start a new game',
    recentGames: 'Recent games',
    continueGame: 'Continue game',
    noRecentGames: 'No saved games yet.',
    gameName: 'Game name',
    player: 'Player',
    createGame: 'Create game',
    houseRules: 'House Rules V1',
    federation: 'Federation 2026',
    scoringRuleSet: 'Scoring rule set',
    backHome: 'Back to home',
    scoreSheet: 'Score sheet',
    rounds: 'rounds',
  },
  ar: {
    appName: 'إستيميشن',
    startNewGame: 'ابدأ لعبة جديدة',
    recentGames: 'الألعاب الأخيرة',
    continueGame: 'متابعة اللعبة',
    noRecentGames: 'لا توجد ألعاب محفوظة بعد.',
    gameName: 'اسم اللعبة',
    player: 'اللاعب',
    createGame: 'إنشاء اللعبة',
    houseRules: 'قواعد المنزل V1',
    federation: 'اتحاد 2026',
    scoringRuleSet: 'نظام احتساب النقاط',
    backHome: 'العودة للرئيسية',
    scoreSheet: 'جدول النقاط',
    rounds: 'جولات',
  },
} as const;

export type Language = keyof typeof translations;
export type TranslationKey = keyof typeof translations.en;
