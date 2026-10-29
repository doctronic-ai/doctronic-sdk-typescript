// The docs quickstart with the SDK: create a user, open a chat, and stream the first turn.
// Prints each finished message and every other event.
//
//   export DOCTRONIC_API_TOKEN="replace-with-your-staging-token"
//   npx tsx examples/quickstart.ts
//
// It uses top-level await, so it runs as an ES module (this package has "type": "module").
// The client targets staging by default. To use another URL, pass `baseUrl` to `new Doctronic()`.

import { randomUUID } from 'node:crypto';

import { Doctronic, isKnownChatStreamEvent } from '@doctronic-ai/sdk';

const client = new Doctronic(); // Reads DOCTRONIC_API_TOKEN.

// 1. Create a user. The SDK sends an Idempotency-Key and reuses it if it retries.
// Email and phone number are unique per user, so each run uses a fresh email and no phone number.
const user = await client.users.create({
  firstName: 'Avery',
  lastName: 'Chen',
  dateOfBirth: '1990-06-15',
  email: `avery+live-quickstart-${randomUUID()}@example.com`,
  sex: 'female',
});
// Save user.id on the patient record in your system. Every later request is scoped to it.
const patient = client.forUser(user.id);

// 2. Create a chat.
const chat = await patient.chats.create({ timezone: 'America/New_York' });

// 3. Stream a patient turn. The turn is never retried automatically.
const stream = await patient.chats.stream(chat.id, {
  userInput: 'I have had a sore throat and fever since yesterday.',
  timezone: 'America/New_York',
});

const messages = new Map<string, { role: string; text: string }>();
for await (const event of stream) {
  if (!isKnownChatStreamEvent(event)) {
    console.log(event.type, event.data); // An event this SDK doesn't know yet.
    continue;
  }
  switch (event.type) {
    case 'message.start':
      messages.set(event.messageId, { role: event.role, text: '' });
      break;
    case 'message.content': {
      const message = messages.get(event.messageId);
      if (message) message.text += event.content;
      break;
    }
    case 'message.stop':
      console.log(messages.get(event.messageId));
      break;
    default:
      console.log(event.type, event); // guardian, conversation.end, error, and the rest
  }
}
