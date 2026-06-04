import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';

jest.mock('./financeGPT/components/Home.js', () => () => <div>Chatbot home</div>);

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          llama2_exists: false,
          mistral_exists: false,
        }),
    })
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('routes to installation when local models are missing', async () => {
  render(<App />);
  const heading = await screen.findByRole('heading', { name: /local models/i });
  expect(heading).toBeInTheDocument();
  expect(screen.getByText(/download ollama/i)).toBeInTheDocument();
});
