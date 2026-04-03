import { useEffect, ReactNode } from 'react';

interface GameStageProps {
  children: ReactNode;
  backgroundImage?: string;
  overlayColor?: string;
}

function updateVhVariable() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

export function GameStage({ children, backgroundImage, overlayColor }: GameStageProps) {
  useEffect(() => {
    document.documentElement.classList.add('game-active');
    updateVhVariable();

    window.addEventListener('resize', updateVhVariable);
    window.addEventListener('orientationchange', () => {
      setTimeout(updateVhVariable, 100);
    });

    return () => {
      document.documentElement.classList.remove('game-active');
      window.removeEventListener('resize', updateVhVariable);
    };
  }, []);

  return (
    <div className="game-stage-wrapper">
      <div
        className="game-stage"
        style={{
          backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div
          className="game-stage-content"
          style={{ backgroundColor: overlayColor }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

interface StageHeaderProps {
  children: ReactNode;
  className?: string;
}

export function StageHeader({ children, className = '' }: StageHeaderProps) {
  return (
    <div className={`flex-shrink-0 ${className}`}>
      {children}
    </div>
  );
}

interface StageBodyProps {
  children: ReactNode;
  className?: string;
  scrollable?: boolean;
}

export function StageBody({ children, className = '', scrollable = false }: StageBodyProps) {
  return (
    <div className={`${scrollable ? 'game-stage-scroll-area' : 'game-stage-fixed'} ${className}`}>
      {children}
    </div>
  );
}

interface StageFooterProps {
  children: ReactNode;
  className?: string;
}

export function StageFooter({ children, className = '' }: StageFooterProps) {
  return (
    <div className={`flex-shrink-0 ${className}`}>
      {children}
    </div>
  );
}
