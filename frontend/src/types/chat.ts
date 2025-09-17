export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatSession {
  sessionId: string;
  messages: Message[];
  threadId?: string;
}

export interface ChatResponse {
  response: string;
  sessionId: string;
  threadId: string;
}