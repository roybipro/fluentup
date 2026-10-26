export interface ConversationScenario {
  id: string;
  titleEn: string;
  titleBn: string;
  category: 'daily_life' | 'university' | 'travel' | 'job_interviews' | 'presentations' | 'technical_discussions';
  level: string;
  openingTutorPromptEn: string;
  openingTutorPromptBn: string;
  sampleStarterEn: string;
}

export const CONVERSATION_SCENARIOS: ConversationScenario[] = [
  {
    id: 'scen-daily',
    titleEn: 'Daily Life: Returning a Faulty Item',
    titleBn: 'দৈনন্দিন জীবন: ত্রুটিপূর্ণ পণ্য ফেরত দেওয়া',
    category: 'daily_life',
    level: 'A2-B1',
    openingTutorPromptEn:
      'Hello! Welcome to Customer Support. How can I help you with your recent electronics purchase today?',
    openingTutorPromptBn:
      'হ্যালো! কাস্টমার সাপোর্টে স্বাগতম। আপনার সম্প্রতি কেনা ইলেকট্রনিক পণ্যটি নিয়ে আজ কীভাবে সাহায্য করতে পারি?',
    sampleStarterEn: 'I bought these wireless headphones yesterday, but the left speaker is not working.',
  },
  {
    id: 'scen-uni',
    titleEn: 'University: Discussing Thesis Scope with Advisor',
    titleBn: 'বিশ্ববিদ্যালয়: থিসিস সুপারভাইজারের সাথে আলোচনা',
    category: 'university',
    level: 'B1-B2',
    openingTutorPromptEn:
      'Good morning! Have you narrowed down the research methodology for your final-year project?',
    openingTutorPromptBn:
      'শুভ সকাল! আপনি কি আপনার শেষ বর্ষের প্রজেক্টের গবেষণা পদ্ধতি চূড়ান্ত করেছেন?',
    sampleStarterEn: 'Yes, Professor. I have decided to focus on natural language processing for Bengali sentiment analysis.',
  },
  {
    id: 'scen-travel',
    titleEn: 'Travel: Airport Transit & Missed Connection',
    titleBn: 'ভ্রমণ: বিমানবন্দরে ট্রানজিট ও কানেক্টিং ফ্লাইট পরিবর্তন',
    category: 'travel',
    level: 'A2-B1',
    openingTutorPromptEn:
      'Good afternoon. I see your incoming flight from Dhaka was delayed by an hour. May I see your boarding pass?',
    openingTutorPromptBn:
      'শুভ অপরাহ্ন। আমি দেখছি ঢাকা থেকে আপনার ফ্লাইটটি এক ঘণ্টা বিলম্বিত হয়েছে। আপনার বোর্ডিং পাসটি দেখতে পারি?',
    sampleStarterEn: 'Here is my boarding pass. Could you please rebook me onto the next available flight to London?',
  },
  {
    id: 'scen-interview',
    titleEn: 'Job Interview: Software Engineer Behavioral Round',
    titleBn: 'চাকরির ইন্টারভিউ: সফটওয়্যার ইঞ্জিনিয়ারিং আচরণগত পর্ব',
    category: 'job_interviews',
    level: 'B2-C1',
    openingTutorPromptEn:
      'Thank you for joining us today. Could you tell me about a time you resolved a critical production bug under tight deadlines?',
    openingTutorPromptBn:
      'আজ আমাদের সাথে যোগ দেওয়ার জন্য ধন্যবাদ। কম সময়ের মধ্যে একটি জটিল প্রোডাকশন বাগ সমাধানের অভিজ্ঞতা বলবেন কি?',
    sampleStarterEn: 'In my previous project, our API latency spiked during peak hours, so I profiled the database queries and added an index.',
  },
  {
    id: 'scen-presentation',
    titleEn: 'Executive Presentation: Quarterly Product Roadmap',
    titleBn: 'প্রেজেন্টেশন: ত্রৈমাসিক প্রোডাক্ট রোডম্যাপ উপস্থাপনা',
    category: 'presentations',
    level: 'B2-C1',
    openingTutorPromptEn:
      'The floor is yours. Please walk the leadership team through our top three priorities for Q4.',
    openingTutorPromptBn:
      'এখন আপনার পালা। আগামী প্রান্তিকের প্রধান তিনটি অগ্রাধিকার সম্পর্কে আমাদের লিডারশিপ টিমকে ধারণা দিন।',
    sampleStarterEn: 'Thank you, everyone. Today I will outline how we plan to improve offline reliability and mobile onboarding.',
  },
  {
    id: 'scen-technical',
    titleEn: 'Technical Discussion: Database Migration & Zero Downtime',
    titleBn: 'টেকনিক্যাল আলোচনা: ডেটাবেস মাইগ্রেশন ও সিস্টেম আর্কিটেকচার',
    category: 'technical_discussions',
    level: 'C1',
    openingTutorPromptEn:
      'We need to add a non-nullable column to a 50-million-row PostgreSQL table. How should we roll this out safely?',
    openingTutorPromptBn:
      '৫ কোটি সারির একটি PostgreSQL টেবিলে ডাউনটাইম ছাড়াই নতুন কলাম যুক্ত করতে আমরা কোন কৌশল নেব?',
    sampleStarterEn: 'We should use an expand-and-contract migration pattern by adding a nullable column first and backfilling in batches.',
  },
];

export interface ListeningExerciseTrack {
  id: string;
  titleEn: string;
  titleBn: string;
  level: string;
  durationSeconds: number;
  audioFilename: string;
  transcriptEn: string;
  transcriptBn: string;
  questions: Array<{
    id: string;
    questionEn: string;
    questionBn: string;
    options: string[];
    correctAnswer: string;
    explanationEn: string;
    explanationBn: string;
  }>;
}

export const LISTENING_TRACKS: ListeningExerciseTrack[] = [
  {
    id: 'listen-1',
    titleEn: 'Campus Orientation & Library Registration',
    titleBn: 'ক্যাম্পাস ওরিয়েন্টেশন ও লাইব্রেরি নিবন্ধন',
    level: 'A2-B1',
    durationSeconds: 32,
    audioFilename: 'campus_orientation.wav',
    transcriptEn:
      'Welcome to the International Student Orientation. The main library on the third floor opens at eight thirty AM from Monday to Saturday. To borrow digital tablets or reserve group study rooms, please activate your student ID card at the help desk before Friday.',
    transcriptBn:
      'আন্তর্জাতিক শিক্ষার্থী ওরিয়েন্টেশনে স্বাগতম। তৃতীয় তলার মূল লাইব্রেরিটি সোমবার থেকে শনিবার সকাল সাড়ে আটটায় খোলে। ডিজিটাল ট্যাবলেট ধার নিতে বা গ্রুপ স্টাডি রুম বুক করতে শুক্রবারের আগে হেল্প ডেস্কে আপনার স্টুডেন্ট আইডি কার্ড সক্রিয় করুন।',
    questions: [
      {
        id: 'lq-1-1',
        questionEn: 'What time does the main library open from Monday to Saturday?',
        questionBn: 'সোমবার থেকে শনিবার মূল লাইব্রেরিটি কখন খোলে?',
        options: ['8:30 AM', '9:00 AM', '7:30 AM', '10:00 AM'],
        correctAnswer: '8:30 AM',
        explanationEn: 'The speaker explicitly states the library opens at "eight thirty AM".',
        explanationBn: 'অডিওতে স্পষ্টভাবে বলা হয়েছে লাইব্রেরি সকাল ৮:৩০ মিনিটে খোলে।',
      },
      {
        id: 'lq-1-2',
        questionEn: 'What must students do before Friday to reserve study rooms?',
        questionBn: 'স্টাডি রুম বুক করার জন্য শুক্রবারের আগে শিক্ষার্থীদের কী করতে হবে?',
        options: [
          'Activate their student ID card at the help desk',
          'Pay an extra library deposit online',
          'Meet the department dean',
          'Submit two printed photographs',
        ],
        correctAnswer: 'Activate their student ID card at the help desk',
        explanationEn: 'Students must activate their student ID card at the help desk before Friday.',
        explanationBn: 'শুক্রবারের আগে হেল্প ডেস্কে গিয়ে স্টুডেন্ট আইডি কার্ড সক্রিয় করতে বলা হয়েছে।',
      },
    ],
  },
  {
    id: 'listen-2',
    titleEn: 'Software Release Stand-Up Briefing',
    titleBn: 'সফটওয়্যার রিলিজ স্ট্যান্ড-আপ ব্রিফিং',
    level: 'B1-B2',
    durationSeconds: 36,
    audioFilename: 'standup_briefing.wav',
    transcriptEn:
      'Good morning team. Before we push version one point two to Google Play on Thursday, QA found an issue when users submit a quiz while switching from Wi-Fi to mobile data. We have added an idempotency token so progress syncs cleanly without duplicating XP.',
    transcriptBn:
      'শুভ সকাল টিম। বৃহস্পতিবার গুগল প্লেতে ভার্সন ১.২ রিলিজ করার আগে QA দল লক্ষ্য করেছে যে ওয়াই-ফাই থেকে মোবাইল ডেটায় পরিবর্তনের সময় কুইজ জমা দিলে সমস্যা হচ্ছিল। আমরা একটি idempotency টোকেন যোগ করেছি যাতে দ্বিগুণ XP ছাড়াই প্রগ্রেস সঠিকভাবে সিঙ্ক হয়।',
    questions: [
      {
        id: 'lq-2-1',
        questionEn: 'When is version 1.2 scheduled to be pushed to Google Play?',
        questionBn: 'ভার্সন ১.২ কবে গুগল প্লেতে রিলিজ করার কথা?',
        options: ['Thursday', 'Monday', 'Friday night', 'Next month'],
        correctAnswer: 'Thursday',
        explanationEn: 'The speaker mentions pushing version 1.2 to Google Play on Thursday.',
        explanationBn: 'বক্তা বৃহস্পতিবার গুগল প্লেতে ভার্সন ১.২ রিলিজের কথা বলেছেন।',
      },
      {
        id: 'lq-2-2',
        questionEn: 'How did the engineering team prevent duplicate XP during network switches?',
        questionBn: 'নেটওয়ার্ক পরিবর্তনের সময় দ্বিগুণ XP হওয়া রোধ করতে ইঞ্জিনিয়ারিং দল কী যোগ করেছে?',
        options: [
          'An idempotency token',
          'A manual admin approval step',
          'Disabling offline mode completely',
          'Deleting user quiz history',
        ],
        correctAnswer: 'An idempotency token',
        explanationEn: 'They added an idempotency token so progress syncs cleanly without duplicating XP.',
        explanationBn: 'দ্বিগুণ XP রোধ করতে তারা একটি idempotency token যুক্ত করেছে।',
      },
    ],
  },
];

export interface IELTSSpeakingCueCard {
  id: string;
  part: 1 | 2 | 3;
  topicEn: string;
  topicBn: string;
  prepSeconds: number;
  speakSeconds: number;
  bulletPointsEn: string[];
  bulletPointsBn: string[];
  sampleBand8HintEn: string;
}

export const IELTS_SPEAKING_PROMPTS: IELTSSpeakingCueCard[] = [
  {
    id: 'ielts-spk-p1',
    part: 1,
    topicEn: 'Part 1: Work, Studies & Daily Technology Use',
    topicBn: 'পার্ট ১: কাজ, পড়াশোনা ও প্রযুক্তির দৈনন্দিন ব্যবহার',
    prepSeconds: 10,
    speakSeconds: 45,
    bulletPointsEn: [
      'Do you work or are you currently a student?',
      'Which mobile application do you find most useful for learning new skills?',
      'How has your study routine changed over the past two years?',
    ],
    bulletPointsBn: [
      'আপনি কি বর্তমানে চাকরি করছেন নাকি পড়াশোনা করছেন?',
      'নতুন দক্ষতা শেখার জন্য কোন মোবাইল অ্যাপটি আপনার কাছে সবচেয়ে কার্যকর মনে হয়?',
      'গত দুই বছরে আপনার পড়াশোনার রুটিন কীভাবে পরিবর্তিত হয়েছে?',
    ],
    sampleBand8HintEn: 'Avoid one-word answers. Give a direct answer followed by a reason and a brief personal example.',
  },
  {
    id: 'ielts-spk-p2',
    part: 2,
    topicEn: 'Part 2 Cue Card: Describe a skill you learned outside formal education',
    topicBn: 'পার্ট ২ কিউ কার্ড: প্রাতিষ্ঠানিক শিক্ষার বাইরে শেখা একটি দক্ষতার বর্ণনা দিন',
    prepSeconds: 60,
    speakSeconds: 120,
    bulletPointsEn: [
      'What the skill was and why you decided to learn it',
      'How you practiced it step by step',
      'What challenges you faced initially',
      'And explain how this skill has benefited your career or personal life',
    ],
    bulletPointsBn: [
      'দক্ষতাটি কী ছিল এবং কেন আপনি এটি শেখার সিদ্ধান্ত নিয়েছিলেন',
      'কীভাবে আপনি ধাপে ধাপে অনুশীলন করেছিলেন',
      'শুরুতে কী কী বাধার সম্মুখীন হয়েছিলেন',
      'এবং এই দক্ষতাটি আপনার পেশাগত বা ব্যক্তিগত জীবনে কীভাবে উপকার করেছে',
    ],
    sampleBand8HintEn: 'Use chronological signposting: "Initially, I struggled with...", "Over the course of six months...", "Looking back...".',
  },
  {
    id: 'ielts-spk-p3',
    part: 3,
    topicEn: 'Part 3 Discussion: Lifelong Learning & Automation in the Workforce',
    topicBn: 'পার্ট ৩ আলোচনা: জীবনব্যাপী শিক্ষা এবং কর্মক্ষেত্রে অটোমেশনের প্রভাব',
    prepSeconds: 15,
    speakSeconds: 90,
    bulletPointsEn: [
      'Why do adults often find it harder to acquire a second language than children?',
      'Should employers fund continuous upskilling programs during working hours?',
      'How will artificial intelligence reshape entry-level professional roles in developing economies?',
    ],
    bulletPointsBn: [
      'শিশুদের তুলনায় প্রাপ্তবয়স্কদের জন্য নতুন ভাষা শেখা কেন প্রায়শই কঠিন মনে হয়?',
      'নিয়োগকর্তাদের কি অফিস সময়ের মধ্যেই কর্মীদের দক্ষতা বৃদ্ধির প্রশিক্ষণ দেওয়া উচিত?',
      'কৃত্রিম বুদ্ধিমত্তা উন্নয়নশীল দেশের চাকরির বাজারে কেমন পরিবর্তন আনবে?',
    ],
    sampleBand8HintEn: 'Speak impersonally about society in general rather than only about yourself ("From an economic standpoint...", "Broadly speaking...").',
  },
];

export interface IELTSWritingPrompt {
  id: string;
  taskNumber: 1 | 2;
  titleEn: string;
  titleBn: string;
  promptEn: string;
  promptBn: string;
  minimumWords: number;
  recommendedMinutes: number;
  academicVocabSuggestions: Array<{ phrase: string; meaningBn: string }>;
}

export const IELTS_WRITING_PROMPTS: IELTSWritingPrompt[] = [
  {
    id: 'ielts-wrt-t1',
    taskNumber: 1,
    titleEn: 'Academic Task 1: Broadband & Mobile Internet Adoption (2015–2025)',
    titleBn: 'একাডেমিক টাস্ক ১: ব্রডব্যান্ড ও মোবাইল ইন্টারনেট ব্যবহারের হার (২০১৫–২০২৫)',
    promptEn:
      'The summary table shows the percentage of households accessing the internet via mobile data versus fixed fiber broadband in three South Asian cities between 2015 and 2025 (Mobile data rose from 38% to 89%; Fixed broadband rose from 12% to 46%). Summarize the main features and make comparisons where relevant.',
    promptBn:
      'প্রদত্ত তথ্যে ২০১৫ থেকে ২০২৫ সালের মধ্যে দক্ষিণ এশিয়ার তিনটি শহরে মোবাইল ডেটা (৩৮% থেকে বেড়ে ৮৯%) এবং ফাইবার ব্রডব্যান্ড (১২% থেকে বেড়ে ৪৬%) ব্যবহারের হারের তুলনা দেখানো হয়েছে। মূল বৈশিষ্ট্যগুলোর সারসংক্ষেপ লিখুন এবং প্রাসঙ্গিক তুলনা করুন।',
    minimumWords: 150,
    recommendedMinutes: 20,
    academicVocabSuggestions: [
      { phrase: 'experienced a dramatic surge', meaningBn: 'নাটকীয় বৃদ্ধি ঘটেছে' },
      { phrase: 'outpaced fixed-line infrastructure', meaningBn: 'ফিক্সড-লাইন অবকাঠামোকে ছাড়িয়ে গেছে' },
      { phrase: 'upward trajectory', meaningBn: 'ঊর্ধ্বমুখী প্রবণতা' },
    ],
  },
  {
    id: 'ielts-wrt-t2',
    taskNumber: 2,
    titleEn: 'Writing Task 2 Essay: Public Transport vs. Expanding Urban Highways',
    titleBn: 'রাইটিং টাস্ক ২ প্রবন্ধ: গণপরিবহন উন্নয়ন বনাম শহরের রাস্তা প্রশস্তকরণ',
    promptEn:
      'Some urban planners argue that the most effective way to reduce traffic congestion is to invest heavily in mass rapid transit systems (such as metro rail and dedicated bus lanes), while others believe building wider highways and flyovers is more practical. Discuss both views and give your own opinion.',
    promptBn:
      'কিছু নগর পরিকল্পনাবিদ মনে করেন যানজট কমানোর সবচেয়ে কার্যকর উপায় হলো মেট্রোরেল ও বাস লেনের মতো গণপরিবহনে বিনিয়োগ করা; অন্যদিকে অনেকে মনে করেন প্রশস্ত মহাসড়ক ও ফ্লাইওভার নির্মাণ বেশি বাস্তবসম্মত। উভয় মতামত আলোচনা করুন এবং আপনার নিজস্ব মতামত দিন।',
    minimumWords: 250,
    recommendedMinutes: 40,
    academicVocabSuggestions: [
      { phrase: 'alleviate chronic gridlock', meaningBn: 'দীর্ঘস্থায়ী যানজট লাঘব করা' },
      { phrase: 'induced demand', meaningBn: 'রাস্তা বাড়ানোর ফলে গাড়ির সংখ্যা বৃদ্ধির প্রবণতা' },
      { phrase: 'sustainable urban mobility', meaningBn: 'টেকসই নগর যাতায়াত ব্যবস্থা' },
    ],
  },
];

export interface IELTSReadingPassage {
  id: string;
  titleEn: string;
  titleBn: string;
  passageEn: string;
  questions: Array<{
    id: string;
    questionEn: string;
    options: string[];
    correctAnswer: string;
    explanationEn: string;
    explanationBn: string;
  }>;
}

export const IELTS_READING_PASSAGES: IELTSReadingPassage[] = [
  {
    id: 'ielts-read-1',
    titleEn: 'The Cognitive Advantage of Spaced Retrieval in Adult Second-Language Acquisition',
    titleBn: 'প্রাপ্তবয়স্কদের দ্বিতীয় ভাষা শিক্ষায় Spaced Retrieval-এর মনস্তাত্ত্বিক সুবিধা',
    passageEn:
      'For decades, conventional language classrooms relied heavily on massed practice—commonly known as cramming—where learners repeat vocabulary lists intensively within a single session. While massed practice creates an illusion of fluency in short-term working memory, neuroimaging studies demonstrate that approximately seventy percent of newly encountered lexical items decay within forty-eight hours unless actively retrieved.\n\nIn contrast, spaced repetition leverages the "testing effect" by scheduling recall attempts just as memory traces begin to fade. Each effortful retrieval strengthens synaptic consolidation in the hippocampus and neocortex, progressively extending optimal review intervals from days to months. Furthermore, adult learners who pair target-language usage with concise conceptual explanations in their first language exhibit lower cognitive overload when mastering abstract grammatical structures.',
    questions: [
      {
        id: 'irq-1',
        questionEn: 'Why does "massed practice" (cramming) often deceive learners?',
        options: [
          'It creates a temporary illusion of fluency in short-term working memory while failing long-term retention.',
          'It immediately erases all previously learned grammar rules.',
          'It prevents learners from reading longer texts.',
          'It only works for children under the age of seven.',
        ],
        correctAnswer:
          'It creates a temporary illusion of fluency in short-term working memory while failing long-term retention.',
        explanationEn: 'Paragraph 1 states that massed practice "creates an illusion of fluency in short-term working memory" while 70% decays within 48 hours.',
        explanationBn: 'প্রথম অনুচ্ছেদে উল্লেখ করা হয়েছে যে একটানা মুখস্থ করলে স্বল্পমেয়াদী স্মৃতিতে দক্ষতার ভ্রম তৈরি হয়, কিন্তু ৪৮ ঘণ্টার মধ্যে ৭০% তথ্য হারিয়ে যায়।',
      },
      {
        id: 'irq-2',
        questionEn: 'According to the passage, how do concise first-language explanations assist adult learners?',
        options: [
          'They reduce cognitive overload when mastering abstract grammatical structures.',
          'They eliminate the need to practice speaking in the target language.',
          'They replace spaced repetition entirely.',
          'They shorten the IELTS examination time.',
        ],
        correctAnswer: 'They reduce cognitive overload when mastering abstract grammatical structures.',
        explanationEn: 'The final sentence explains that pairing target-language usage with concise L1 explanations reduces cognitive overload.',
        explanationBn: 'শেষ বাক্যে বলা হয়েছে যে মাতৃভাষায় সংক্ষিপ্ত ব্যাখ্যা জটিল ব্যাকরণ বোঝার মানসিক চাপ (cognitive overload) কমায়।',
      },
    ],
  },
];
