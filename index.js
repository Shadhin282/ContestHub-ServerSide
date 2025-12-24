require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const stripe = require('stripe')(process.env.Payment_Secret_key)


const admin = require('firebase-admin')
const { default: Stripe } = require('stripe')
const port = process.env.PORT 
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString(
  'utf-8'
)
const serviceAccount = JSON.parse(decoded)
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const app = express()
// middleware
app.use(cors())
app.use(express.json())

// jwt middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(' ')[1]
  console.log('token: ', token)
  if (!token) return res.status(401).send({ message: 'Unauthorized Access!' })
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    req.tokenEmail = decoded.email
    console.log(decoded)
    next()
  } catch (err) {
    console.log(err)
    return res.status(401).send({ message: 'Unauthorized Access!', err })
  }
}

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})
async function run() {
  try {
    const db = client.db('ContestDB')
    const contestsCollection = db.collection('contests')
    const usersCollection = db.collection('users')
    const submissionsCollection = db.collection('submissions')
    const contestOrdersCollection = db.collection('contestOrders')
    const createContestCollection = db.collection('createContest')

    // Users data in DB
    app.get('/users', async(req, res)=> {
      const result = await usersCollection.find().toArray()
      res.send(result)
    })

    app.get('/users/role',verifyJWT, async (req, res) => {
      
      const result = await usersCollection.findOne({email: req.tokenEmail})
      res.send({role: result?.role})
    })

    // app.patch('/adminUser', verifyJWT, async (req, res) => {
    //   const {email,role} = req.body;
      
    //   const result = await usersCollection.updateOne({ email }, { $set: {role} })
    //   res.send(result)
    // })


    app.post('/users', async (req, res) => {
      const userData = req.body
      // console.log(contestData)
      userData.created_at = new Date().toISOString();
      userData.last_loggedIn = new Date().toISOString();
      userData.role = 'user'
      const query = {email: userData.email}

      const alreadyExist = await usersCollection.findOne(query)

      if (alreadyExist) {
        const result = await usersCollection.updateOne(query,{
           
          $set: {
            last_loggedIn: new Date().toISOString()
          },
        })
        return res.send(result)
      }
      const result = await usersCollection.insertOne(userData)

      res.send(result)
    })


    // Submission in DB
    app.get('/submissions', async(req, res)=> {
      const result = await submissionsCollection.find().toArray()
      res.send(result)
    })
    app.post('/submissions', async (req, res) => {
      const submitData = req.body
      // console.log(submitData)
      const result = await submissionsCollection.insertOne(submitData)
      res.send(result)
    })

    app.get('/submissions/:id', async (req, res) => {
      const { id } = req.params;
      // console.log(id)
      const result = await submissionsCollection.findOne({ _id: new ObjectId(id) })
      // console.log(result)
      res.send(result)

    })
    // Contest data in DB
    app.post('/contests', async (req, res) => {
      const contestData = req.body
      console.log(contestData)
      const result = await contestsCollection.insertOne(contestData)
      res.send(result)
    })

    // get all plants from db
    app.get('/contests', async (req, res) => {
      const result = await contestsCollection.find().toArray()
      res.send(result)
    })

    app.get('/contests/:id', async (req, res) => {
      const { id } = req.params;
      // console.log(id)
      const result = await contestsCollection.findOne({ _id: new ObjectId(id) })
      // console.log(result)
      res.send(result)

    })

    app.post('/create-contest', async (req, res) => {
      const contestInfo = req.body;
      const result = await createContestCollection.insertOne(contestInfo)
      res.send(result)
    })

    app.get('/create-contest', async (req, res) => {
      const result = await createContestCollection.find().toArray()
      res.send(result)
    })
    app.get('/create-contest/:id', async (req, res) => {
      const {id} = req.params
      const result = await createContestCollection.findOne({_id: new ObjectId(id)})
      res.send(result)
    })
    app.patch('/create-contest/:id', async (req, res) => {
      const { id } = req.params
      console.log(id)
      const query = { _id: new ObjectId(id) }
      
      const contestInfo = req.body;
      console.log(contestInfo)
      const result = await createContestCollection.updateOne(query, {$set : {contestInfo}})
      res.send(result)
    })
    app.patch('/create-contest-status/:id', async (req, res) => {
      const { id } = req.params
      console.log(id)
      const query = { _id: new ObjectId(id) }
      
      const contestInfo = req.body;
      console.log(contestInfo)
      const result = await createContestCollection.updateOne(query, {$set : {status : contestInfo.status}})
      res.send(result)
    })

    app.delete('/create-contest/:id', async (req, res) => {
      const { id } = req.params
      console.log(id)
      const result = await createContestCollection.deleteOne({_id: new ObjectId(id)})
      res.send(result)
    })
    
     app.get('/mycontests',verifyJWT, async (req, res) => {
      //  const {email} = req.params.email;
      //  console.log(email)
      // console.log(id)
      const result = await contestsCollection.findOne({ creator_email: req.tokenEmail })
      // console.log(result)
      res.send(result)

    })

     app.get('/search', async (req, res) => {
       const data = req.query.search;
      //  console.log(data)
      const result = await contestsCollection.find({type: {$regex:data, $options: 'i'}}).toArray();
      res.send(result)
     })
    
    // Payment section

    app.post('/payment', async (req, res) => {
      const paymentInfo = req.body;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: paymentInfo?.name,
                description: paymentInfo?.description,
                images: [paymentInfo.image],
              },
              unit_amount: paymentInfo?.price * 100,
            },
            quantity: paymentInfo?.quantity,
          },
        ],
        customer_email: paymentInfo?.participator?.email,
        mode: 'payment',
        metadata: {
          contestId: paymentInfo?.id,
          participator: paymentInfo?.participator.email,
        },
        success_url: `${process.env.CLIENT_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_DOMAIN}/contest/${paymentInfo.id}`,
      })

  res.send({url: session.url});
    });
    

    app.post('/payment-success', async (req, res) => {
      const { sessionId } = req.body
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      const contest = await contestsCollection.findOne({
        _id: new ObjectId(session.metadata.contestId),
      })
      const order = await contestOrdersCollection.findOne({
        transactionId: session.payment_intent,
      })

      if (session.status === 'complete' && contest && !order) {
        // save order data in db
        const orderInfo = {
          contestId: session.metadata.contestId,
          transactionId: session.payment_intent,
          customer: session.metadata.participator,
          status: 'pending',
          name: contest.name,
          type: contest.type,
          quantity: 1,
          price: session.amount_total / 100,
          image: contest?.bannerImage,
        }
        const result = await contestOrdersCollection.insertOne(orderInfo)
        // update plant quantity
        await contestsCollection.updateOne(
          {
            _id: new ObjectId(session.metadata.contestId),
          },
          { $push: { participants: session.metadata.participator } }
        )

        return res.send({
          transactionId: session.payment_intent,
          contestorderId: result.insertedId,
        })
      }
      res.send(
        res.send({
          transactionId: session.payment_intent,
          contestorderId: contestOrders._id,
        })
      )
    })

app.patch('/update-role', async (req, res) => {
      const { email, role } = req.body
      const result = await usersCollection.updateOne(
        { email },
        { $set: { role: role } }
      )
      console.log(result)

      res.send(result)
    })












    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from Server..')
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
