import json
import logging
import re
from typing import Any, Dict, List
import httpx
from app.config import settings
from app.schemas import (
    AITutorRequest,
    AITutorResponse,
    GrammarCheckRequest,
    GrammarCheckResponse,
    GrammarExplanationItem,
    GrammarPracticeExercise,
    IELTSCriteriaBreakdown,
    IELTSEvaluateRequest,
    IELTSEvaluateResponse,
    UsefulVocabItem,
)

logger = logging.getLogger("fluentup.ai")

GRAMMAR_RULES = [
    (
        re.compile(r"\bdid not went\b", re.IGNORECASE),
        "did not go",
        'After auxiliary "did not", always use the base form of the verb ("go" instead of "went").',
        '"did not"-এর পরে সর্বদা মূল verb-এর base form ("go") বসে, অতীত রূপ ("went") নয়।',
    ),
    (
        re.compile(r"\bdidn't went\b", re.IGNORECASE),
        "didn't go",
        'After "didn\'t", use the base verb "go".',
        '"didn\'t"-এর পরে মূল verb-এর base form ("go") বসে।',
    ),
    (
        re.compile(r"\bI am working here since (\d+|two|three|four|five) years\b", re.IGNORECASE),
        r"I have been working here for \1 years",
        'Use Present Perfect Continuous ("have been working") with "for" + duration of time.',
        'অতীতে শুরু হয়ে বর্তমানে চলমান কাজের মেয়াদের আগে "for" এবং "have been working" বসে।',
    ),
    (
        re.compile(r"\bI am agree\b", re.IGNORECASE),
        "I agree",
        '"Agree" is already a verb in English, so do not put "am" before it.',
        '"Agree" নিজেই একটি ক্রিয়াপদ (verb), তাই এর আগে "am" বসে না।',
    ),
    (
        re.compile(r"\bHe don't\b", re.IGNORECASE),
        "He doesn't",
        'Third-person singular subjects ("He/She/It") require "doesn\'t" (does not).',
        'He / She / It একবচন কর্তার সাথে "doesn\'t" (does not) বসে।',
    ),
    (
        re.compile(r"\bShe don't\b", re.IGNORECASE),
        "She doesn't",
        'Third-person singular subjects ("She") require "doesn\'t" (does not).',
        '"She"-এর সাথে "doesn\'t" (does not) বসে।',
    ),
    (
        re.compile(r"\bThey is\b", re.IGNORECASE),
        "They are",
        'Plural subject "They" takes the plural verb "are".',
        'বহুবচন কর্তা "They"-এর সাথে "are" বসে।',
    ),
    (
        re.compile(r"\bdiscuss about\b", re.IGNORECASE),
        "discuss",
        '"Discuss" is a transitive verb and does not take the preposition "about".',
        '"Discuss" শব্দের মধ্যেই "about" অর্থ নিহিত থাকে, তাই এর পরে আলাদা করে "about" বসে না।',
    ),
    (
        re.compile(r"\bmore better\b", re.IGNORECASE),
        "much better",
        '"Better" is already comparative; do not combine it with "more". Use "much better".',
        '"Better" নিজেই Comparative degree, তাই এর আগে "more" না বসিয়ে "much better" বসাতে হয়।',
    ),
]


def deterministic_grammar_check(req: GrammarCheckRequest) -> GrammarCheckResponse:
    original = req.text.strip()
    corrected = original
    explanations: List[GrammarExplanationItem] = []

    for pattern, replacement, rule_en, rule_bn in GRAMMAR_RULES:
        match = pattern.search(corrected)
        if match:
            orig_frag = match.group(0)
            corrected = pattern.sub(replacement, corrected)
            corr_frag = pattern.sub(replacement, orig_frag)
            explanations.append(
                GrammarExplanationItem(
                    originalFragment=orig_frag,
                    correctedFragment=corr_frag,
                    ruleEn=rule_en,
                    ruleBn=rule_bn,
                )
            )

    if corrected:
        corrected = corrected[0].upper() + corrected[1:]
    if not re.search(r"[.!?]$", corrected):
        corrected += "."

    if not explanations:
        explanations.append(
            GrammarExplanationItem(
                originalFragment=original,
                correctedFragment=corrected,
                ruleEn="Your sentence is grammatically well-formed. See the natural rewrite for stylistic polish.",
                ruleBn="আপনার বাক্যটি ব্যাকরণগতভাবে সঠিক। আরও সাবলীল প্রকাশের জন্য নিচের Natural Rewrite-টি দেখুন।",
            )
        )

    natural = (
        f"From my perspective, {corrected[0].lower() + corrected[1:]}"
        if len(corrected) < 65
        else corrected
    )

    return GrammarCheckResponse(
        originalText=original,
        correctedText=corrected,
        naturalRewrite=natural,
        explanations=explanations,
        practiceExercise=GrammarPracticeExercise(
            question="Choose the sentence with accurate verb tense and preposition usage:",
            options=[
                "We discussed the release schedule and agreed on the testing plan.",
                "We discussed about the release schedule and I am agree.",
                "We did not went to discuss about the release schedule.",
            ],
            correctAnswer="We discussed the release schedule and agreed on the testing plan.",
            explanationEn='"Discuss" takes a direct object without "about", and "agree" is an action verb.',
            explanationBn='"Discuss"-এর পরে "about" বসে না এবং "agree"-এর আগে "am" বসে না।',
        ),
        providerStatus="deterministic_engine",
    )


async def call_gemini_json(system_instruction: str, user_prompt: str) -> Dict[str, Any]:
    """
    Calls Google Gemini API on the server side with strict timeout and JSON parsing.
    Raises an exception if GEMINI_API_KEY is not configured or if the remote provider fails.
    """
    api_key = settings.gemini_api_key.strip()
    if not api_key or api_key.startswith("your-"):
        raise RuntimeError("GEMINI_API_KEY is not configured")

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent?key={api_key}"
    )
    payload = {
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "temperature": 0.3,
            "responseMimeType": "application/json",
        },
    }

    async with httpx.AsyncClient(timeout=settings.ai_request_timeout_seconds) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        body = resp.json()
        text = body["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)


async def generate_tutor_feedback(req: AITutorRequest) -> AITutorResponse:
    try:
        raw = await call_gemini_json(
            system_instruction=(
                "You are FluentUp AI English Tutor helping Bengali and international learners. "
                "Return strict JSON matching the AITutorResponse schema with fields: "
                "tutorReply, originalLearnerResponse, correctedSentence, mistakesExplanationEn (list), "
                "mistakesExplanationBn (list), naturalAlternative, usefulVocabulary (list of {term, meaningEn, meaningBn}), "
                "followUpPracticePrompt, providerStatus='live_ai'."
            ),
            user_prompt=(
                f"Scenario: {req.scenarioTitle}\n"
                f"Learner message: {req.userMessage}\n"
                f"Preferred explanation language: {req.explanationLanguage}"
            ),
        )
        raw["providerStatus"] = "live_ai"
        return AITutorResponse.model_validate(raw)
    except Exception as exc:
        # Privacy-conscious logging: log only exception class, never full user PII
        logger.info("AI tutor falling back to deterministic engine (%s)", type(exc).__name__)
        grammar = deterministic_grammar_check(
            GrammarCheckRequest(text=req.userMessage, explanationLanguage=req.explanationLanguage)
        )
        return AITutorResponse(
            tutorReply=(
                f"Great effort in our '{req.scenarioTitle}' scenario! "
                "Building on what you said, how would you explain the key priority to your colleague or advisor?"
            ),
            originalLearnerResponse=req.userMessage.strip(),
            correctedSentence=grammar.correctedText,
            mistakesExplanationEn=[e.ruleEn for e in grammar.explanations],
            mistakesExplanationBn=[e.ruleBn for e in grammar.explanations],
            naturalAlternative=grammar.naturalRewrite,
            usefulVocabulary=[
                UsefulVocabItem(
                    term="articulate",
                    meaningEn="Express an idea clearly and fluently",
                    meaningBn="স্পষ্ট ও সাবলীলভাবে প্রকাশ করা",
                ),
                UsefulVocabItem(
                    term="feasible",
                    meaningEn="Practical and achievable",
                    meaningBn="বাস্তবায়নযোগ্য",
                ),
            ],
            followUpPracticePrompt=(
                "Reply in 2-3 sentences using at least one linking phrase such as 'Furthermore' or 'Consequently'."
            ),
            providerStatus="offline_fallback",
        )


async def generate_grammar_check(req: GrammarCheckRequest) -> GrammarCheckResponse:
    try:
        raw = await call_gemini_json(
            system_instruction=(
                "You are an expert English & Bengali grammar instructor. Return strict JSON matching "
                "GrammarCheckResponse schema with providerStatus='live_ai'."
            ),
            user_prompt=f"Analyze and correct: {req.text}",
        )
        raw["providerStatus"] = "live_ai"
        return GrammarCheckResponse.model_validate(raw)
    except Exception:
        return deterministic_grammar_check(req)


async def generate_ielts_evaluation(req: IELTSEvaluateRequest) -> IELTSEvaluateResponse:
    disclaimer_text = (
        "UNOFFICIAL PRACTICE ESTIMATE: This feedback is generated for self-study practice only "
        "and is not an official IELTS score or endorsed by IELTS partners."
    )
    try:
        raw = await call_gemini_json(
            system_instruction=(
                "You are an IELTS academic coach providing UNOFFICIAL practice estimates. "
                "Never claim this is an official IELTS score. Return strict JSON matching IELTSEvaluateResponse."
            ),
            user_prompt=f"Module: {req.moduleType}\nTask: {req.taskId}\nResponse: {req.userResponse}",
        )
        raw["isUnofficialEstimate"] = True
        raw["disclaimer"] = disclaimer_text
        return IELTSEvaluateResponse.model_validate(raw)
    except Exception:
        words = len(req.userResponse.strip().split())
        sentences = len([s for s in re.split(r"[.!?]+", req.userResponse) if s.strip()])
        has_linkers = bool(
            re.search(
                r"\b(however|furthermore|moreover|although|while|consequently|overall)\b",
                req.userResponse,
                re.IGNORECASE,
            )
        )
        score = 5.5
        if words >= 80:
            score += 1.0
        elif words >= 40:
            score += 0.5
        if has_linkers:
            score += 0.5
        if sentences >= 4:
            score += 0.5
        band = min(8.0, max(4.5, round(score * 2) / 2))

        return IELTSEvaluateResponse(
            moduleType=req.moduleType,
            taskId=req.taskId,
            estimatedBand=band,
            isUnofficialEstimate=True,
            disclaimer=disclaimer_text,
            criteriaBreakdown=IELTSCriteriaBreakdown(
                taskAchievementOrFluency=band,
                coherenceAndCohesion=min(8.5, band + 0.5) if has_linkers else max(4.5, band - 0.5),
                lexicalResource=band,
                grammaticalRangeAndAccuracy=band,
            ),
            strengthsEn=[
                f"Submitted {words} words across {sentences} sentences addressing task '{req.taskId}'.",
                "Clear main position with structured supporting statements.",
            ],
            improvementsEn=[
                "Include specific quantitative or real-world examples to strengthen Task Achievement.",
                "Use a wider range of C1 academic collocations and subordinate clauses.",
            ],
            improvementsBn=[
                "Task Achievement স্কোর বাড়াতে সুনির্দিষ্ট উদাহরণ ও তথ্য যুক্ত করুন।",
                "সাধারণ শব্দের পরিবর্তে একাডেমিক Collocation এবং Complex Sentence ব্যবহার করুন।",
            ],
            improvedSampleResponse=(
                "While expanding road capacity offers short-term relief, investing in high-capacity mass transit "
                "systems is substantially more effective for long-term urban mobility and environmental sustainability."
            ),
        )
