import { ACCESS_TOKEN, SIGNING_SECRET } from './secrets'
import { EntryData, LeagueData, OverallStats } from './types'
const SIGN_VERSION = 'v0'
const secretKeyData = new TextEncoder().encode(SIGNING_SECRET)
const LEAGUE_CODE = 1040641

/**
 * Modified version of hex to bytes function posted here:
 * https://stackoverflow.com/a/34356351/489667
 *
 * @param hex a string of hexadecimal characters
 * @returns binary form of the hexadecimal string
 */
function hexToBytes(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2)
  for (let c = 0; c < hex.length; c += 2) {
    bytes[c / 2] = parseInt(hex.substr(c, 2), 16)
  }

  return bytes.buffer
}

const rankChangeIcon = (currentRank: number, lastRank: number) => {
  if (lastRank === 0) {
    // lastRank is 0 at start of season
    return ''
  }

  if (currentRank < lastRank) {
    return ':arrow_up:'
  } else if (currentRank > lastRank) {
    return ':arrow_down:'
  } else {
    return ''
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSlackEvent(body: any): Promise<void> {
  const text = body?.event?.text as string | undefined

  const fplBotCommands = ['fplbot, get latest standings']
  if (typeof text !== 'undefined' && fplBotCommands.includes(text.trim())) {
    const overallStats: OverallStats = await getOverallStats()
    const { events, total_players } = overallStats
    const currentGameweek = events.find(
      ({ is_current }: { is_current: boolean }) => is_current,
    )

    const fplData = await getLeagueData()
    const {
      league,
      standings: { results },
    } = fplData

    const entriesData = await getEntriesData(results.map(({ entry }) => entry))

    const league_standing_blocks = results.map(
      (
        { event_total, rank, last_rank, entry_name, player_name, total },
        index: number,
      ) => [
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Rank:* ${rank} ${rankChangeIcon(rank, last_rank)}`,
            },
            {
              type: 'mrkdwn',
              text: `*Gameweek points:* ${event_total}`,
            },
            {
              type: 'mrkdwn',
              text: `*Player:* ${player_name}`,
            },
            {
              type: 'mrkdwn',
              text: `*Team:* ${entry_name}`,
            },
            {
              type: 'mrkdwn',
              text: `*Total:* ${total}`,
            },
            {
              type: 'mrkdwn',
              text: `*Gameweek rank:* ${new Intl.NumberFormat('en-AU').format(
                entriesData[index].summary_event_rank,
              )}`,
            },
            {
              type: 'mrkdwn',
              text: `*Overall rank:* ${new Intl.NumberFormat('en-AU').format(
                entriesData[index].summary_overall_rank,
              )}`,
            },
          ],
        },
        {
          type: 'divider',
        },
      ],
    )

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Here are the latest standings for :headingparrot: *${league.name}* :headingparrot:`,
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Total Players:* ${new Intl.NumberFormat('en-AU').format(
              total_players,
            )}`,
          },
          ...(currentGameweek
            ? [
                {
                  type: 'mrkdwn',
                  text: `*${currentGameweek.name} average:* ${currentGameweek.average_entry_score}`,
                },
              ]
            : []),
        ],
      },
      {
        type: 'divider',
      },
      ...league_standing_blocks.flat(),
    ]

    const message = {
      channel: body.event.channel,
      blocks,
    }

    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json;charset=UTF-8',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify(message),
    })
  }
}

const getOverallStats: () => Promise<OverallStats> = async () => {
  const response = await fetch(
    'https://fantasy.premierleague.com/api/bootstrap-static/',
  )
  const data: OverallStats = await response.json()
  return data
}

const getLeagueData: () => Promise<LeagueData> = async () => {
  const response = await fetch(
    `https://fantasy.premierleague.com/api/leagues-classic/${LEAGUE_CODE}/standings`,
  )
  const data: LeagueData = await response.json()
  return data
}

const getEntriesData: (entries: number[]) => Promise<EntryData[]> = async (
  entries,
) => {
  const entriesData = await Promise.all(
    entries.map((entry: number) => {
      return getEntryData(entry)
    }),
  )
  return entriesData
}

const getEntryData: (entry: number) => Promise<EntryData> = async (entry) => {
  const response = await fetch(
    `https://fantasy.premierleague.com/api/entry/${entry}/`,
  )
  const data: EntryData = await response.json()
  return data
}

const generateJsonResponse = (
  response: { status?: 'Unauthorized' | 'OK'; challenge?: unknown },
  status = 200,
): Response => {
  const json = JSON.stringify(response)

  return new Response(json, {
    headers: {
      'content-type': 'application/json;charset=UTF-8',
    },
    status,
  })
}

const handleRequest = async (request: Request): Promise<Response> => {
  const text = await request.text()

  const timeHeader = request.headers.get('X-Slack-Request-Timestamp') ?? '0'
  const headerKeys = []
  for (const key of request.headers.keys()) {
    headerKeys.push(key)
  }

  const currentTimestamp = Math.floor(new Date().getTime() / 1000)
  const isRequestTimeClose =
    Math.abs(parseInt(timeHeader, 10) - currentTimestamp) < 60 * 5

  // remove starting 'v0=' from the signature header
  const signatureStr =
    request.headers.get('X-Slack-Signature')?.substring(3) ?? ''
  // convert the hex string of x-slack-signature header to binary
  const signature = hexToBytes(signatureStr)

  const baseString = `${SIGN_VERSION}:${timeHeader}:${text}`

  const key = await crypto.subtle.importKey(
    'raw',
    secretKeyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )

  const encoder = new TextEncoder()

  const verified = await crypto.subtle.verify(
    'HMAC',
    key,
    signature,
    encoder.encode(baseString),
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { type: eventType, challenge, ...body }: any = JSON.parse(text)

  switch (eventType) {
    case 'url_verification': {
      if (verified && isRequestTimeClose) {
        return generateJsonResponse({ challenge })
      } else {
        return generateJsonResponse({ status: 'Unauthorized' }, 403)
      }
    }
    case 'event_callback': {
      await handleSlackEvent(body)
      return generateJsonResponse({ status: 'OK' })
    }
    default: {
      return generateJsonResponse({ status: 'OK' })
    }
  }
}

addEventListener('fetch', (event) => {
  const { request } = event
  const contentType = request.headers.get('content-type') ?? ''

  if (request.method === 'POST' && contentType.includes('application/json')) {
    event.respondWith(handleRequest(request))
  } else {
    return generateJsonResponse({ status: 'OK' })
  }
})
