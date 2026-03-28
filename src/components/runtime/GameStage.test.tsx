import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameStage, StageHeader, StageBody, StageFooter } from './GameStage';

describe('GameStage', () => {
  it('renders children within the stage content area', () => {
    render(
      <GameStage>
        <div data-testid="test-content">Test Content</div>
      </GameStage>
    );
    expect(screen.getByTestId('test-content')).toBeInTheDocument();
  });

  it('applies game-stage-wrapper class for centering', () => {
    const { container } = render(
      <GameStage>
        <div>Content</div>
      </GameStage>
    );
    const wrapper = container.querySelector('.game-stage-wrapper');
    expect(wrapper).toBeInTheDocument();
  });

  it('applies game-stage class for flex column layout', () => {
    const { container } = render(
      <GameStage>
        <div>Content</div>
      </GameStage>
    );
    const stage = container.querySelector('.game-stage');
    expect(stage).toBeInTheDocument();
  });

  it('applies game-stage-content class for flex column layout', () => {
    const { container } = render(
      <GameStage>
        <div>Content</div>
      </GameStage>
    );
    const content = container.querySelector('.game-stage-content');
    expect(content).toBeInTheDocument();
  });

  it('applies background image when provided', () => {
    const { container } = render(
      <GameStage backgroundImage="https://example.com/bg.jpg">
        <div>Content</div>
      </GameStage>
    );
    const stage = container.querySelector('.game-stage');
    expect(stage).toHaveStyle({ backgroundImage: 'url(https://example.com/bg.jpg)' });
  });

  it('applies overlay color when provided', () => {
    const { container } = render(
      <GameStage overlayColor="rgba(0,0,0,0.5)">
        <div>Content</div>
      </GameStage>
    );
    const content = container.querySelector('.game-stage-content');
    expect(content).toHaveStyle({ backgroundColor: 'rgba(0,0,0,0.5)' });
  });
});

describe('StageHeader', () => {
  it('renders children', () => {
    render(
      <StageHeader>
        <div data-testid="header-content">Header</div>
      </StageHeader>
    );
    expect(screen.getByTestId('header-content')).toBeInTheDocument();
  });

  it('applies flex-shrink-0 class', () => {
    const { container } = render(
      <StageHeader>Header</StageHeader>
    );
    expect(container.firstChild).toHaveClass('flex-shrink-0');
  });

  it('applies custom className', () => {
    const { container } = render(
      <StageHeader className="custom-class">Header</StageHeader>
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });
});

describe('StageBody', () => {
  it('renders children', () => {
    render(
      <StageBody>
        <div data-testid="body-content">Body</div>
      </StageBody>
    );
    expect(screen.getByTestId('body-content')).toBeInTheDocument();
  });

  it('applies game-stage-fixed class by default (non-scrollable)', () => {
    const { container } = render(
      <StageBody>Body</StageBody>
    );
    expect(container.firstChild).toHaveClass('game-stage-fixed');
  });

  it('applies game-stage-scroll-area class when scrollable is true', () => {
    const { container } = render(
      <StageBody scrollable>Body</StageBody>
    );
    expect(container.firstChild).toHaveClass('game-stage-scroll-area');
  });

  it('applies custom className', () => {
    const { container } = render(
      <StageBody className="custom-body">Body</StageBody>
    );
    expect(container.firstChild).toHaveClass('custom-body');
  });
});

describe('StageFooter', () => {
  it('renders children', () => {
    render(
      <StageFooter>
        <div data-testid="footer-content">Footer</div>
      </StageFooter>
    );
    expect(screen.getByTestId('footer-content')).toBeInTheDocument();
  });

  it('applies flex-shrink-0 class', () => {
    const { container } = render(
      <StageFooter>Footer</StageFooter>
    );
    expect(container.firstChild).toHaveClass('flex-shrink-0');
  });

  it('applies custom className', () => {
    const { container } = render(
      <StageFooter className="custom-footer">Footer</StageFooter>
    );
    expect(container.firstChild).toHaveClass('custom-footer');
  });
});

describe('GameStage Layout Integration', () => {
  it('renders header, body, and footer in correct order', () => {
    const { container } = render(
      <GameStage>
        <StageHeader>
          <div data-testid="hud">HUD Area</div>
        </StageHeader>
        <StageBody>
          <div data-testid="game-content">Game Content</div>
        </StageBody>
        <StageFooter>
          <div data-testid="footer">Footer</div>
        </StageFooter>
      </GameStage>
    );

    const content = container.querySelector('.game-stage-content');
    expect(content).toBeInTheDocument();

    const hud = screen.getByTestId('hud');
    const gameContent = screen.getByTestId('game-content');
    const footer = screen.getByTestId('footer');

    expect(hud).toBeInTheDocument();
    expect(gameContent).toBeInTheDocument();
    expect(footer).toBeInTheDocument();
  });

  it('header stays outside centered content block', () => {
    const { container } = render(
      <GameStage>
        <StageHeader data-testid="header-wrapper">
          <div>Progress Bar</div>
        </StageHeader>
        <StageBody>
          <div className="flex-1 flex flex-col justify-center">
            <div>Question + Answers</div>
          </div>
        </StageBody>
      </GameStage>
    );

    const header = container.querySelector('.flex-shrink-0');
    expect(header).toBeInTheDocument();
  });
});
