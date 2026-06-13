import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./financeGPT/components/Home', () => function MockHomeChatbot() {
  return <div>Private GPT Home</div>;
});

describe('App routing', () => {
  test('renders the home screen on the root route', () => {
    window.history.pushState({}, '', '/');

    render(<App />);

    expect(screen.getByText(/private gpt home/i)).toBeInTheDocument();
  });

  test('redirects unknown routes back to the home screen', () => {
    window.history.pushState({}, '', '/missing');

    render(<App />);

    expect(screen.getByText(/private gpt home/i)).toBeInTheDocument();
  });
});
