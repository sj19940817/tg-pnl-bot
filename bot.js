const web3 = require("@solana/web3.js")
const { Telegraf } = require('telegraf')
const axios = require('axios')

const tgToken = "6989322161:AAHHcLEa9ax66dfXKhzjJP085FiKPPl3HE8" //test
const bot = new Telegraf(tgToken, { handlerTimeout: 9_000_000 })

function checkValidate(address) {
    // Check validation of address
    try {

        // Check Solana wallet validation.
        let pubKey = new web3.PublicKey(address)

        web3.PublicKey.isOnCurve(pubKey.toBuffer())

        return true
    } catch {
        return false
    }
}

newAllTokens = []
async function getAllTokens() {
    const AllTokens = await axios
        .request({
            method: 'GET',
            url: 'https://cache.jup.ag/all-tokens'
        })
        .then(function (response) {
            return response.data
        })
        .catch(function (error) {
            console.error(error)
        })
    AllTokens.forEach((token, ind) => {
        newAllTokens[token.symbol + '#' + token.name] = token.address
    })
}

async function runScanning(address) {
    const pubKey = new web3.PublicKey(address)

    const options = {
        method: 'GET',
        url: 'https://api.uniwhales.io/v3/feed/' + pubKey + '/details/?tx_type=swap&chains=solana',
    }
    let data = await axios
        .request(options)
        .then(async function (response) {
            const before = response.data.transactions.paging.first_cursor
            if (before != null) {
                const _options = {
                    method: 'GET',
                    url: 'https://api.uniwhales.io/v3/feed/' + pubKey + '/details/?tx_type=swap&chains=solana&before=' + before,
                }
                const _transactions = await axios
                    .request(_options)
                    .then(function (_response) {
                        return _response.data.transactions.data
                    })
                    .catch(function (error) {
                        console.error(error)
                    })

                return response.data.transactions.data.concat(_transactions);
            } else {
                return response.data.transactions.data
            }
        })
        .catch(function (error) {
            console.error(error)
        })

    if (data.length == undefined) return 'No Transation!!!';

    data = data.slice(0, 15)
    let totalPNL = 0
    let replyText = pubKey + '\n\n'
    let replyTextToken = ''
    let profitable = 0
    let trades = 0
    const limitToken = 15
    data.forEach(lists => {

        let txsBought = 0
        let txsSold = 0
        let tokenBought = 0
        let tokenSold = 0
        let minus = 0
        let token_address = ''
        let rugCal = true
        let rug = 0

        lists.transactions.forEach(async list => {

            const transaction = list.events[0]
            // if (trades == 1) console.log(transaction)
            if (transaction.token0_address == 'native') { // Bought
                txsBought++
                tokenBought += transaction.token0_amount
            } else {                                     // Sold
                rugCal = false
                txsSold++
                tokenSold += transaction.token1_amount
            }

            minus = (transaction.ago.split(' ')[0] / 60)
            token_address = transaction.token1_name + ' ' + transaction.main_token_symbol
            if (rugCal) {
                const _options = {
                    method: 'GET',
                    url: 'https://quote-api.jup.ag/v6/quote?inputMint=' + newAllTokens[transaction.token0_symbol + '#' + transaction.token0_name] + '&outputMint=' + newAllTokens[transaction.token1_symbol + '#' + transaction.token1_name] + '&amount=' + (transaction.token0_amount * 100000000) + '&slippageBps=50&computeAutoSlippage=true&swapMode=ExactIn&onlyDirectRoutes=false&asLegacyTransaction=false&maxAccounts=64&experimentalDexes=Jupiter%20LO'
                }
                const curBalance = await axios
                    .request(_options)
                    .then(function (response) {
                        return response.data.outAmount
                    })
                    .catch(function (error) {
                        // console.error(error)
                    })
                let diffBalance = (curBalance / (curBalance - transaction.token1_amount))
                if (diffBalance < 0) rug += diffBalance
            }

        })

        if (tokenSold != 0 || tokenBought != 0) {
            minus = parseInt(minus)
            let _ago = 'Time in trade: 0 ago \n'
            if (minus < 60)
                _ago = 'Time in trade: ' + parseInt(Math.floor(minus)) + (parseInt(Math.floor(minus)) == 1 ? ' min' : ' mins') + ' ago \n'

            if (minus >= 60)
                _ago = 'Time in trade: ' + parseInt(Math.floor(minus / 60)) + (parseInt(Math.floor(minus / 60)) == 1 ? ' hr' : ' hrs') + ' ago \n'

            if (minus >= 1440)
                _ago = 'Time in trade: ' + parseInt(Math.floor(minus / 1440)) + (parseInt(Math.floor(minus / 1440)) == 1 ? ' day' : ' days') + ' ago \n'

            if (minus >= 10080)
                _ago = 'Time in trade: ' + parseInt(Math.floor(minus / 10080)) + (parseInt(Math.floor(minus / 10080)) == 1 ? ' wk' : ' wks') + ' ago \n'

            if (minus > 43200)
                _ago = 'Time in trade: ' + parseInt(Math.floor(minus / 43200)) + (parseInt(Math.floor(minus / 43200)) == 1 ? ' mo' : ' mos') + ' ago \n'

            let PNL = tokenSold - tokenBought

            trades++
            replyTextToken += 'Trade ' + trades + ' - ' + token_address + ' \n'
            replyTextToken += '(-) Bought: ' + tokenBought + ' sol - ' + txsBought + 'txn \n'
            replyTextToken += '(+) Sold: ' + tokenSold + ' sol - ' + txsSold + 'txn \n'

            if (PNL > 0) {
                replyTextToken += '(=) PNL: +' + PNL + ' sol 🟢 \n'
                profitable++
            } else {
                replyTextToken += '(=) PNL: ' + PNL + ' sol 🔴 \n'
            }

            if (rug < 0.01 && rug != 0) {
                replyTextToken += 'unrealized: ' + rug + ' sol\n\n'
                replyTextToken += 'Time in trade: RUG ☠'
            } else {
                replyTextToken += 'unrealized: 0\n\n'
                replyTextToken += _ago
            }

            replyTextToken += '_____________ \n\n'

            totalPNL += PNL
        }
    })

    replyText += 'Number of profitable trades in last ' + limitToken + ' trades 💸💸: ' + profitable + '/' + limitToken + '\n'
    replyText += 'Total profit/loss in last' + limitToken + ': ' + ((totalPNL > 0) ? ('+' + totalPNL + ' sol 🟢') : totalPNL + ' sol 🔴') + '\n\n'

    replyText += replyTextToken
    console.log(replyText)
    return replyText
}

getAllTokens()
bot.start((ctx) => ctx.reply('😁😁🙌🙌 SolanaScan60Bot Start 🙌🙌😁😁'))

bot.on('text', async (ctx) => {

    let validate = checkValidate(ctx.message.text)
    if (validate) {
        let response = await runScanning(ctx.message.text)
        await ctx.reply(response)
        // runScanning(ctx.message.text)
    } else {
        await ctx.reply("ERR: This is not Solana wallet")
    }
})

bot.launch()

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))