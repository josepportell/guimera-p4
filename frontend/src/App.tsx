import { useEffect, useRef } from 'react';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { useChat } from './hooks/useChat';
import './App.css'

function App() {
  const { messages, isLoading, error, sendMessage, clearChat } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const isIframe = window.self !== window.top;

  return (
    <div className={`app ${isIframe ? 'iframe' : ''}`}>
      <header className="app-header">
        <div className="header-content">
          <h1>Guimera - Assistent IA</h1>
          <p className="subtitle">Expert en Guimera.info i webs afins</p>
        </div>
        <button onClick={clearChat} className="clear-button">
          Nova conversa
        </button>
      </header>

      <div className="chat-container">
        <div className="messages-container">
          {messages.length === 0 && (
            <div className="welcome-message">
              <h2>Benvingut a l'Assistent IA de Guimera!</h2>
              <p className="welcome-description">
                Especialista en continguts de Guimera.info i la xarxa de webs relacionades.
                Et puc ajudar amb informació precisa i actualitzada.
              </p>

              <div className="topic-suggestions">
                <h3>Pots preguntar-me sobre:</h3>
                <div className="topic-grid">
                  <div className="topic-category">
                    <h4>🏛️ Museu i Patrimoni</h4>
                    <ul>
                      <li>Horaris i tarifes</li>
                      <li>Col·leccions i exposicions</li>
                      <li>Visites guiades</li>
                      <li>Història del castell</li>
                    </ul>
                  </div>

                  <div className="topic-category">
                    <h4>🏰 Història i Arquitectura</h4>
                    <ul>
                      <li>Origen medieval</li>
                      <li>Edificis històrics</li>
                      <li>Personatges il·lustres</li>
                      <li>Evolució urbanística</li>
                    </ul>
                  </div>

                  <div className="topic-category">
                    <h4>🌿 Natura i Entorn</h4>
                    <ul>
                      <li>Paisatge i geografia</li>
                      <li>Flora i fauna</li>
                      <li>Rutes i senderisme</li>
                      <li>Miradors i vistes</li>
                    </ul>
                  </div>

                  <div className="topic-category">
                    <h4>🎭 Cultura i Tradicions</h4>
                    <ul>
                      <li>Festes populars</li>
                      <li>Tradicions locals</li>
                      <li>Gastronomia típica</li>
                      <li>Artesania</li>
                    </ul>
                  </div>

                  <div className="topic-category">
                    <h4>🚗 Turisme Pràctic</h4>
                    <ul>
                      <li>Com arribar</li>
                      <li>Allotjaments</li>
                      <li>Restaurants</li>
                      <li>Serveis turístics</li>
                    </ul>
                  </div>

                  <div className="topic-category">
                    <h4>📚 Educació i Recerca</h4>
                    <ul>
                      <li>Estudis històrics</li>
                      <li>Investigacions</li>
                      <li>Recursos educatius</li>
                      <li>Bibliografia</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="sample-questions">
                <h3>Exemples de preguntes:</h3>
                <div className="question-examples">
                  <button className="example-btn" onClick={() => sendMessage("Quin és l'horari del museu?")}>
                    "Quin és l'horari del museu?"
                  </button>
                  <button className="example-btn" onClick={() => sendMessage("Com puc arribar a Guimerà amb transport públic?")}>
                    "Com puc arribar a Guimerà amb transport públic?"
                  </button>
                  <button className="example-btn" onClick={() => sendMessage("Quina és la història del castell de Guimerà?")}>
                    "Quina és la història del castell de Guimerà?"
                  </button>
                  <button className="example-btn" onClick={() => sendMessage("Quines activitats hi ha per a famílies?")}>
                    "Quines activitats hi ha per a famílies?"
                  </button>
                </div>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}

          {isLoading && (
            <div className="loading-message">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}

          {error && (
            <div className="error-message">
              Error: {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <ChatInput onSendMessage={sendMessage} disabled={isLoading} />
      </div>
    </div>
  )
}

export default App
