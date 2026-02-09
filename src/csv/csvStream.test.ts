import { describe, it, expect, vi, beforeEach } from 'vitest';
import { csvStreamToKafka, CsvStreamOptions, HttpError } from './csvStream.js';

vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

globalThis.fetch = vi.fn();

const mockSend = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();

vi.mock('kafkajs', () => {
  class MockKafka {
    producer() {
      return {
        send: mockSend,
        connect: mockConnect,
        disconnect: mockDisconnect,
        on: vi.fn(),
        events: {
          CONNECT: 'producer.connect',
          DISCONNECT: 'producer.disconnect',
        },
      };
    }
  }
  return {
    Kafka: MockKafka,
  };
});

function mockFetch(csvData: string) {
  (globalThis.fetch as any).mockResolvedValue({
    ok: true,
    body: true,
    text: () => Promise.resolve(csvData),
  });
}

function buildOptions(
  overrides: Partial<CsvStreamOptions> = {}
): CsvStreamOptions {
  return {
    csvUrl: 'https://www.spc.noaa.gov/climo/reports/260206_hail.csv',
    topic: 'raw-weather-reports',
    kafka: { clientId: 'storm-data-collector', brokers: ['localhost:9092'] },
    type: 'hail',
    ...overrides,
  };
}

describe('csvStreamToKafka', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses real hail report CSV and injects type correctly', async () => {
    const csvData =
      'Time,Size,Location,County,State,Lat,Lon,Comments\n' +
      '1510,125,8 ESE Chappel,San Saba,TX,31.02,-98.44,1.25 inch hail reported at Colorado Bend State Park. (SJT)\n' +
      '1703,100,3 SE Burleson,Johnson,TX,32.5,-97.29,Quarter hail reported. (FWD)\n';

    mockFetch(csvData);

    await csvStreamToKafka(buildOptions());

    expect(mockConnect).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledTimes(1);

    const messages = mockSend.mock.calls[0]?.[0]?.messages;
    expect(messages.length).toBe(2);

    const parsed = messages.map((m: any) => JSON.parse(m.value));
    expect(parsed[0]).toMatchObject({
      Time: '1510',
      Size: '125',
      Location: '8 ESE Chappel',
      County: 'San Saba',
      State: 'TX',
      Lat: '31.02',
      Lon: '-98.44',
      Type: 'hail',
    });
    expect(parsed[1]).toMatchObject({
      Time: '1703',
      Size: '100',
      Location: '3 SE Burleson',
      County: 'Johnson',
      State: 'TX',
      Lat: '32.5',
      Lon: '-97.29',
      Type: 'hail',
    });
  });

  it('parses real tornado report CSV with correct fields', async () => {
    const csvData =
      'Time,F_Scale,Location,County,State,Lat,Lon,Comments\n' +
      '1223,UNK,2 N Mcalester,Pittsburg,OK,34.96,-95.77,This tornado moved across the northwest side of McAlester... damaging the roofs of homes... uprooting trees... and snapping power poles. The damage survey was conducted (TSA)\n' +
      '1716,UNK,2 ESE Ravenna,Buffalo,NE,41.02,-98.87,This tornado touched down at 1216 PM CDT 2 miles east southeast of Ravenna... and lifted at 1231 PM CDT 3 miles north of Ravenna. The rating was EF1... with an estimate (GID)\n';

    mockFetch(csvData);

    await csvStreamToKafka(
      buildOptions({
        csvUrl: 'https://www.spc.noaa.gov/climo/reports/260206_torn.csv',
        type: 'torn',
      })
    );

    const messages = mockSend.mock.calls[0]?.[0]?.messages;
    expect(messages.length).toBe(2);

    const parsed = messages.map((m: any) => JSON.parse(m.value));
    expect(parsed[0]).toMatchObject({
      Time: '1223',
      F_Scale: 'UNK',
      Location: '2 N Mcalester',
      County: 'Pittsburg',
      State: 'OK',
      Type: 'tornado',
    });
  });

  it('parses real wind report CSV', async () => {
    const csvData =
      'Time,Speed,Location,County,State,Lat,Lon,Comments\n' +
      '1245,UNK,Mcalester,Pittsburg,OK,34.94,-95.77,Large trees and power lines down. (TSA)\n' +
      '1251,65,4 N Dow,Pittsburg,OK,34.94,-95.59,(TSA)\n';

    mockFetch(csvData);

    await csvStreamToKafka(
      buildOptions({
        csvUrl: 'https://www.spc.noaa.gov/climo/reports/260206_wind.csv',
        type: 'wind',
      })
    );

    const messages = mockSend.mock.calls[0]?.[0]?.messages;
    expect(messages[0]).toBeDefined();

    const parsed = JSON.parse(messages[0].value);
    expect(parsed).toMatchObject({
      Time: '1245',
      Speed: 'UNK',
      Location: 'Mcalester',
      County: 'Pittsburg',
      State: 'OK',
      Type: 'wind',
    });
  });

  it('handles empty CSV gracefully', async () => {
    mockFetch('');

    await csvStreamToKafka(
      buildOptions({
        csvUrl: 'https://www.spc.noaa.gov/climo/reports/260206_empty.csv',
        type: 'empty',
      })
    );

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockConnect).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('throws HttpError with 404 status code when CSV not found', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      body: null,
    });

    try {
      await csvStreamToKafka(
        buildOptions({
          csvUrl: 'https://www.spc.noaa.gov/climo/reports/260206_missing.csv',
          type: 'missing',
        })
      );
      expect.fail('Should have thrown an error');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).statusCode).toBe(404);
      expect((err as HttpError).message).toContain('Failed to fetch CSV');
    }
  });

  it('throws HttpError with 500 status code on server error', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
    });

    try {
      await csvStreamToKafka(
        buildOptions({
          csvUrl: 'https://www.spc.noaa.gov/climo/reports/260206_error.csv',
          type: 'error',
        })
      );
      expect.fail('Should have thrown an error');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).statusCode).toBe(500);
      expect((err as HttpError).message).toContain('status 500');
    }
  });

  it('throws HttpError with 400 status code on client error', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      body: null,
    });

    try {
      await csvStreamToKafka(
        buildOptions({
          csvUrl: 'https://www.spc.noaa.gov/climo/reports/260206_bad.csv',
          type: 'bad',
        })
      );
      expect.fail('Should have thrown an error');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).statusCode).toBe(400);
    }
  });

  it('throws when res.body is null', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      body: null,
    });

    await expect(csvStreamToKafka(buildOptions())).rejects.toThrow(
      'No response body'
    );
  });

  it('publishes all rows in a single batch', async () => {
    const csvData =
      'Time,Size,Location,County,State,Lat,Lon,Comments\n' +
      '1510,125,8 ESE Chappel,San Saba,TX,31.02,-98.44,Report 1\n' +
      '1703,100,3 SE Burleson,Johnson,TX,32.5,-97.29,Report 2\n' +
      '1704,100,Anthon,Woodbury,IA,42.39,-95.87,Report 3\n' +
      '1709,100,2 SE Kennedale,Tarrant,TX,32.63,-97.21,Report 4\n' +
      '1710,175,2 NE Kennedale,Tarrant,TX,32.77,-97.31,Report 5\n';

    mockFetch(csvData);

    await csvStreamToKafka(buildOptions());

    // All 5 rows in a single send call
    expect(mockSend).toHaveBeenCalledTimes(1);
    const messages = mockSend.mock.calls[0]?.[0]?.messages;
    expect(messages.length).toBe(5);
  });
});
