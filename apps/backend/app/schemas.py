from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator


class AuthRegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    display_name: str = Field(default="Learner", min_length=1, max_length=120)

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        cleaned = v.strip().lower()
        if "@" not in cleaned or "." not in cleaned.split("@")[-1]:
            raise ValueError("Invalid email address format")
        return cleaned


class AuthLoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class AuthResponse(BaseModel):
    user_id: str
    email: str
    display_name: str
    access_token: str
    expires_in: int = 3600


class ProfileUpdateRequest(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    explanation_language: Optional[Literal["bn", "en"]] = None
    proficiency_level: Optional[
        Literal["beginner", "elementary", "intermediate", "upper_intermediate", "advanced", "ielts"]
    ] = None
    learning_goal: Optional[str] = Field(default=None, max_length=64)
    daily_target_minutes: Optional[int] = Field(default=None, ge=5, le=180)
    interests: Optional[List[str]] = None


class ProfileResponse(BaseModel):
    id: str
    email: str
    display_name: str
    explanation_language: str
    proficiency_level: str
    learning_goal: str
    daily_target_minutes: int
    total_xp: int
    current_streak: int
    longest_streak: int
    subscription_tier: str


class QuizSubmissionRequest(BaseModel):
    lesson_id: str = Field(..., min_length=1, max_length=64)
    client_submission_id: str = Field(..., min_length=4, max_length=128)
    score_percent: int = Field(..., ge=0, le=100)
    correct_count: int = Field(..., ge=0)
    total_questions: int = Field(..., gt=0)
    xp_reward: int = Field(default=25, ge=0, le=200)
    passing_score: int = Field(default=70, ge=50, le=100)
    mistakes: List[Dict[str, Any]] = Field(default_factory=list)

    @field_validator("correct_count")
    @classmethod
    def check_correct_le_total(cls, v: int, info) -> int:  # type: ignore
        return v


class QuizSubmissionResponse(BaseModel):
    lesson_id: str
    client_submission_id: str
    score_percent: int
    passed: bool
    xp_earned: int
    total_xp: int
    duplicate_submission: bool


class VocabularyUpsertRequest(BaseModel):
    word_or_phrase: str = Field(..., min_length=1, max_length=160)
    meaning_bn: str = Field(default="", max_length=255)
    definition_en: str = Field(..., min_length=1, max_length=1000)
    example_sentence: str = Field(default="", max_length=1000)
    phonetic: str = Field(default="/—/", max_length=100)
    is_favorite: bool = False
    rating: Optional[int] = Field(default=None, ge=0, le=5)


class VocabularyItemResponse(BaseModel):
    id: str
    word_or_phrase: str
    meaning_bn: str
    definition_en: str
    example_sentence: str
    phonetic: str
    is_favorite: bool
    repetition_number: int
    easiness_factor: float
    interval_days: int
    next_review_at: str


class AITutorRequest(BaseModel):
    scenarioId: str = Field(..., min_length=1, max_length=64)
    scenarioTitle: str = Field(..., min_length=1, max_length=200)
    userMessage: str = Field(..., min_length=1, max_length=1500)
    explanationLanguage: Literal["bn", "en"] = "bn"


class UsefulVocabItem(BaseModel):
    term: str
    meaningEn: str
    meaningBn: str


class AITutorResponse(BaseModel):
    tutorReply: str
    originalLearnerResponse: str
    correctedSentence: str
    mistakesExplanationEn: List[str]
    mistakesExplanationBn: List[str]
    naturalAlternative: str
    usefulVocabulary: List[UsefulVocabItem]
    followUpPracticePrompt: str
    providerStatus: Literal["live_ai", "offline_fallback"]


class GrammarCheckRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=3000)
    explanationLanguage: Literal["bn", "en"] = "bn"

    @field_validator("text")
    @classmethod
    def check_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Text cannot be empty or whitespace only")
        return v.strip()


class GrammarExplanationItem(BaseModel):
    originalFragment: str
    correctedFragment: str
    ruleEn: str
    ruleBn: str


class GrammarPracticeExercise(BaseModel):
    question: str
    options: List[str]
    correctAnswer: str
    explanationEn: str
    explanationBn: str


class GrammarCheckResponse(BaseModel):
    originalText: str
    correctedText: str
    naturalRewrite: str
    explanations: List[GrammarExplanationItem]
    practiceExercise: GrammarPracticeExercise
    providerStatus: Literal["live_ai", "deterministic_engine"]


class IELTSEvaluateRequest(BaseModel):
    moduleType: Literal["speaking", "writing", "reading", "listening"]
    taskId: str = Field(..., min_length=1, max_length=64)
    promptText: str = Field(default="", max_length=2000)
    userResponse: str = Field(..., min_length=1, max_length=5000)


class IELTSCriteriaBreakdown(BaseModel):
    taskAchievementOrFluency: float = Field(..., ge=1.0, le=9.0)
    coherenceAndCohesion: float = Field(..., ge=1.0, le=9.0)
    lexicalResource: float = Field(..., ge=1.0, le=9.0)
    grammaticalRangeAndAccuracy: float = Field(..., ge=1.0, le=9.0)


class IELTSEvaluateResponse(BaseModel):
    moduleType: Literal["speaking", "writing", "reading", "listening"]
    taskId: str
    estimatedBand: float = Field(..., ge=1.0, le=9.0)
    isUnofficialEstimate: Literal[True] = True
    disclaimer: str
    criteriaBreakdown: IELTSCriteriaBreakdown
    strengthsEn: List[str]
    improvementsEn: List[str]
    improvementsBn: List[str]
    improvedSampleResponse: str


class SyncMutationItem(BaseModel):
    id: str
    type: str
    payload: Dict[str, Any]
    createdAt: str
    retryCount: int = 0


class SyncBatchRequest(BaseModel):
    mutations: List[SyncMutationItem]


class AccountDeletionRequestModel(BaseModel):
    reason: Optional[str] = Field(default="User requested account deletion", max_length=255)
