import WebSocket, { WebSocketServer } from 'ws'
import express, { Request, Response } from 'express'

// Define OCPP message types
interface OCPPMessage {
  messageTypeId: number
  uniqueId: string
  action: string
  payload: any
}

interface ChargerConnection {
  ws: WebSocket
  chargePointId: string
}

// Define OCPP 1.6 Message Types
const CALL_MESSAGE = 2
const CALL_RESULT_MESSAGE = 3

// Maintain a map of charge points (chargers) to their WebSocket connections
const chargerConnections: Map<string, WebSocket> = new Map()

// Function to send BootNotification response
function sendBootNotificationResponse(ws: WebSocket, uniqueId: string) {
  const response = [
    CALL_RESULT_MESSAGE, // Call result message type ID
    uniqueId, // The unique ID from the BootNotification call
    {
      currentTime: new Date().toISOString(),
      interval: 300,
      status: 'Accepted',
    },
  ]

  ws.send(JSON.stringify(response))
}

// Function to send a message to a specific charger by Charge Point ID
function sendMessageToCharger(chargePointId: string, message: any) {
  const ws = chargerConnections.get(chargePointId)
  if (ws) {
    ws.send(JSON.stringify(message))
    console.log(`Message sent to charger ${chargePointId}`)
  } else {
    console.error(`Charger with ID ${chargePointId} not connected`)
  }
}

// Function to send RemoteStartTransaction command
function sendRemoteStartTransaction(chargePointId: string, connectorId: number, idTag: string) {
  const message = [
    CALL_MESSAGE,
    `${Date.now()}`, // Unique ID for this transaction
    'RemoteStartTransaction',
    {
      connectorId,
      idTag
    },
  ]

  sendMessageToCharger(chargePointId, message)
}

// Function to send RemoteStopTransaction command
function sendRemoteStopTransaction(chargePointId: string, transactionId: number) {
  const message = [
    CALL_MESSAGE,
    `${Date.now()}`, // Unique ID for this transaction
    'RemoteStopTransaction',
    {
      transactionId,
    },
  ]

  sendMessageToCharger(chargePointId, message)
}

// Create a WebSocket server for OCPP
const wss = new WebSocketServer({ port: 9000 })

wss.on('connection', (ws: WebSocket) => {
  console.log('New charger connected')

  ws.on('message', (message: string) => {
    console.log(`Received: ${message}`)

    // Parse the OCPP message
    const ocppMessage: OCPPMessage = JSON.parse(message)

    // Handle BootNotification
    if (ocppMessage.messageTypeId === CALL_MESSAGE && ocppMessage.action === 'BootNotification') {
      const { chargePointModel, chargePointVendor } = ocppMessage.payload
      const chargePointId = ocppMessage.payload.chargePointSerialNumber || ocppMessage.payload.chargePointModel

      // Store the charger connection based on the Charge Point ID
      chargerConnections.set(chargePointId, ws)
      console.log(`Charger ${chargePointId} connected: Model ${chargePointModel}, Vendor ${chargePointVendor}`)

      // Send BootNotification response
      sendBootNotificationResponse(ws, ocppMessage.uniqueId)
    } else if (ocppMessage.messageTypeId === CALL_RESULT_MESSAGE) {
      console.log(`Received response for: ${ocppMessage.action}`)
    } else {
      console.log('Unsupported message type or action')
    }
  })

  ws.on('close', () => {
    // Find the charger that disconnected and remove from the map
    for (const [chargePointId, connection] of chargerConnections.entries()) {
      if (connection === ws) {
        chargerConnections.delete(chargePointId)
        console.log(`Charger ${chargePointId} disconnected`)
        break
      }
    }
  })
})

// Create an Express server to expose HTTP routes
const app = express()
app.use(express.json())

// HTTP endpoint to start a charging session
app.post('/start', (req: Request, res: Response) => {
  const { chargePointId, connectorId, idTag } = req.body
  if (!chargePointId || !connectorId || !idTag) {
    return res.status(400).send('Missing required parameters: chargePointId, connectorId, idTag')
  }

  sendRemoteStartTransaction(chargePointId, connectorId, idTag)
  res.status(200).send(`RemoteStartTransaction sent to charger ${chargePointId}`)
})

// HTTP endpoint to stop a charging session
app.post('/stop', (req: Request, res: Response) => {
  const { chargePointId, transactionId } = req.body
  if (!chargePointId || !transactionId) {
    return res.status(400).send('Missing required parameters: chargePointId, transactionId')
  }

  sendRemoteStopTransaction(chargePointId, transactionId)
  res.status(200).send(`RemoteStopTransaction sent to charger ${chargePointId}`)
})

// Start the Express server
app.listen(3000, () => {
  console.log('Express server is running on http://localhost:3000')
})

console.log('OCPP 1.6 WebSocket server is running on ws://localhost:9000')
