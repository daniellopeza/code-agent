import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type SubQuestion = {
  id: string;
  question: string;
  answered: boolean;
};

export async function decomposeQuery(userGoal: string): Promise<SubQuestion[]> {
  const response = await client.responses.create({
    model: "gpt-5.4-mini",
    input: [
      {
        role: "system",
        content:
          "Break down the user's complex question into 2-4 simpler, independent sub-questions that together fully answer the original question. Each sub-question should be answerable by searching and analyzing code files. Return ONLY a JSON array of objects with 'question' field, no markdown or extra text.",
      },
      {
        role: "user",
        content: userGoal,
      },
    ],
    max_output_tokens: 300,
  });

  const text = response.output_text?.trim();
  if (!text) {
    throw new Error("No decomposition returned");
  }

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return [{ id: "0", question: userGoal, answered: false }];
  }

  const parsed = JSON.parse(jsonMatch[0]) as Array<{ question: string }>;
  return parsed.map((item, idx) => ({
    id: String(idx),
    question: item.question,
    answered: false,
  }));
}
