import { ACCESS_TOKEN, SIGNING_SECRET } from './secrets'
const SIGN_VERSION = 'v0'
const secretKeyData = new TextEncoder().encode(SIGNING_SECRET)

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
  if (currentRank < lastRank) {
    return ':arrow_down:'
  } else if (currentRank > lastRank) {
    return ':arrow_up:'
  } else {
    return ''
  }
}

async function handleSlackEvent(body: any): Promise<void> {
  const text = body?.event?.text as string | undefined

  const fplBotCommands = ['fplbot, get latest standings']
  if (typeof text !== 'undefined' && fplBotCommands.includes(text.trim())) {
    const fplData = await getFplData()
    const {
      league,
      standings: { results },
    }: any = fplData

    const results_blocks = results.map(
      ({
        event_total,
        rank,
        last_rank,
        entry_name,
        player_name,
        total,
      }: any) => [
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Rank:* ${rank} ${rankChangeIcon(rank, last_rank)}`,
            },
            {
              type: 'mrkdwn',
              text: `*GW points:* ${event_total}`,
            },
            {
              type: 'mrkdwn',
              text: `*Player/Team:* ${player_name} - ${entry_name}`,
            },
            {
              type: 'mrkdwn',
              text: `*Total:* ${total}`,
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
      ...results_blocks.flat(),
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

const getFplData = async () => {
  const response = await fetch(
    'https://fantasy.premierleague.com/api/leagues-classic/578497/standings',
  )
  const data = await response.json()
  return data
}

const generateJsonResponse = (response: any, status = 200): Response => {
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
