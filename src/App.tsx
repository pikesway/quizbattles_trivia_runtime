import { useState, useEffect } from 'react';
import { TriviaGame } from './components/TriviaGame';
import { Admin } from './components/admin/Admin';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/admin/ProtectedRoute';

function App() {
  const [view, setView] = useState<'player' | 'admin'>(() => {
    const path = window.location.pathname;
    return path.startsWith('/admin') ? 'admin' : 'player';
  });

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      setView(path.startsWith('/admin') ? 'admin' : 'player');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function navigate(newView: 'player' | 'admin') {
    const path = newView === 'admin' ? '/admin' : '/';
    window.history.pushState({}, '', path);
    setView(newView);
  }

  if (view === 'admin') {
    return (
      <AuthProvider>
        <ProtectedRoute>
          <div>
            <div className="fixed top-4 right-4 z-50">
              <button
                onClick={() => navigate('player')}
                className="px-3 py-1.5 text-xs bg-gray-800 text-white rounded-lg hover:bg-gray-700"
              >
                Player View
              </button>
            </div>
            <Admin />
          </div>
        </ProtectedRoute>
      </AuthProvider>
    );
  }

  return (
    <div>
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => navigate('admin')}
          className="px-3 py-1.5 text-xs bg-gray-800 text-white rounded-lg hover:bg-gray-700"
        >
          Admin
        </button>
      </div>
      <TriviaGame />
    </div>
  );
}

export default App;
