import { useState, useEffect } from 'react';
import { TriviaGame } from './components/TriviaGame';
import { TestQuiz } from './components/TestQuiz';
import { Admin } from './components/admin/Admin';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/admin/ProtectedRoute';

type ViewType = 'player' | 'admin' | 'test';

interface PlatformParams {
  campaign_id?: string;
  template_id?: string;
  instance_id?: string;
  return_url?: string;
}

function getPlatformParams(): PlatformParams {
  const searchParams = new URLSearchParams(window.location.search);
  const campaign_id = searchParams.get('campaign_id') || undefined;
  const template_id = searchParams.get('template_id') || undefined;
  const instance_id = searchParams.get('instance_id') || undefined;
  const return_url = searchParams.get('return_url') || undefined;

  return {
    campaign_id,
    template_id,
    instance_id,
    return_url: return_url ? decodeURIComponent(return_url) : undefined,
  };
}

function getInitialView(): { view: ViewType; testToken?: string } {
  const path = window.location.pathname;
  if (path.startsWith('/admin')) return { view: 'admin' };
  if (path.startsWith('/test/')) {
    const token = path.split('/test/')[1];
    return { view: 'test', testToken: token };
  }
  return { view: 'player' };
}

function App() {
  const [viewState, setViewState] = useState<{ view: ViewType; testToken?: string }>(getInitialView);

  useEffect(() => {
    const handlePopState = () => {
      setViewState(getInitialView());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function navigate(newView: ViewType) {
    const path = newView === 'admin' ? '/admin' : '/';
    window.history.pushState({}, '', path);
    setViewState({ view: newView });
  }

  if (viewState.view === 'test' && viewState.testToken) {
    return <TestQuiz token={viewState.testToken} />;
  }

  if (viewState.view === 'admin') {
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

  const platformParams = getPlatformParams();

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
      <TriviaGame
        campaign_id={platformParams.campaign_id}
        template_id={platformParams.template_id}
        instance_id={platformParams.instance_id}
        return_url={platformParams.return_url}
      />
    </div>
  );
}

export default App;
