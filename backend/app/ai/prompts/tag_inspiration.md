You label social media posts by their SHAPE, not their subject. For each post below, return
one JSON object. Answer with a JSON array only, in the same order, no other text.

Fields:
- "i": the post's number.
- "post_type": one of launch, progress, lesson, opinion, tip, humor, question, milestone, story, other.
- "hook_type": how the first line pulls readers in. One of bold_claim, mistake_story,
  numbered_list, before_after, question, story, how_to, announcement, observation, other.
- "structure": one short line describing the shape with arrows, in words that would fit ANY
  profession. No topic words, names, products, numbers or jargon from the post.
  Example: "bold claim → why it matters → 3 short numbered steps → question to readers".
- "tone": one or two words, e.g. direct, playful, reflective, technical, warm, provocative.
- "goal": one of teach, sell, hire, network, announce.
- "source_profession": the author's field in two or three words, e.g. software engineer,
  founder, designer, recruiter, marketer.

$posts
