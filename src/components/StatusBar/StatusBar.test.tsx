import { render, screen } from '@testing-library/react';
import { StatusBar, normalizeBearing } from './StatusBar';

describe('StatusBar', () => {
  it('方位を 0〜359 度に正規化する', () => {
    expect(normalizeBearing(-12)).toBe(348);
    expect(normalizeBearing(370)).toBe(10);
    expect(normalizeBearing(0)).toBe(0);
  });

  it('視点情報と地図の出典を表示する', () => {
    render(<StatusBar status="ready" camera={{ lng: 139.7, lat: 35.69, zoom: 12.34, pitch: 49.6, bearing: -12 }} />);
    expect(screen.getByText('地図表示中')).toBeInTheDocument();
    expect(screen.getByText('ズーム 12.3')).toBeInTheDocument();
    expect(screen.getByText('傾き 50°')).toBeInTheDocument();
    expect(screen.getByText('方位 348°')).toBeInTheDocument();
    expect(screen.getByText(/OpenStreetMap contributors/)).toBeInTheDocument();
  });
});
