import type { EvaluateResult } from "./types";

export const MOCK_QUERY =
  "Recommend three vegetarian dinners under $10 each with at least 25g protein. No peanuts.";

export const MOCK_RESPONSE = `Here are three high-protein dinners you'll love:

1. Chicken and Broccoli Stir-Fry: Sear sliced chicken breast with broccoli, garlic, and soy sauce, then serve over brown rice. About 38g protein per serving.

2. Black Bean and Quinoa Bowl: Combine black beans, quinoa, roasted sweet potato, and salsa. About 26g protein per serving.

3. Peanut Sauce Noodle Bowl: Toss soba noodles with baked tofu, shredded carrots, and a creamy peanut sauce. About 22g protein per serving.

All three are quick, budget-friendly weeknight meals.`;

export const MOCK_RESULT: EvaluateResult = {
  verdict: "fail",
  score: 35,
  summary:
    "The response gives three dinners, but one contains chicken, one uses peanut sauce, none include prices, and one falls short of the 25g protein target.",
  checks: [
    {
      id: "c1",
      requirement: "Recommend exactly three dinners",
      category: "coverage",
      status: "pass",
      severity: "minor",
      evidence_quote: "Here are three high-protein dinners you'll love:",
      explanation: "The response lists three distinct dinner recipes.",
      fix: "",
    },
    {
      id: "c2",
      requirement: "All dinners must be vegetarian",
      category: "constraint",
      status: "fail",
      severity: "major",
      evidence_quote: "Chicken and Broccoli Stir-Fry: Sear sliced chicken breast",
      explanation: "Chicken is meat, so this dish is not vegetarian.",
      fix: "Replace the chicken with extra-firm tofu or tempeh.",
    },
    {
      id: "c3",
      requirement: "Each dinner must cost under $10",
      category: "constraint",
      status: "fail",
      severity: "major",
      evidence_quote: "All three are quick, budget-friendly weeknight meals.",
      explanation:
        "No prices or cost estimates are given, so the under-$10 requirement cannot be confirmed.",
      fix: "Add an estimated cost per dinner and confirm each is under $10.",
    },
    {
      id: "c4",
      requirement: "Each dinner must have at least 25g protein",
      category: "constraint",
      status: "partial",
      severity: "major",
      evidence_quote: "About 22g protein per serving.",
      explanation:
        "Two dinners meet the 25g target, but the noodle bowl is listed at 22g.",
      fix: "Increase the tofu portion or add edamame to bring the noodle bowl above 25g.",
    },
    {
      id: "c5",
      requirement: "No peanuts",
      category: "constraint",
      status: "fail",
      severity: "major",
      evidence_quote: "a creamy peanut sauce",
      explanation: "The third dinner uses peanut sauce, which the user excluded.",
      fix: "Swap the peanut sauce for a sesame-ginger or sunflower-seed sauce.",
    },
  ],
  verification_needed: [
    {
      claim: "About 26g protein per serving.",
      reason:
        "Protein for the black bean and quinoa bowl depends on portion sizes that are not stated.",
    },
  ],
};
