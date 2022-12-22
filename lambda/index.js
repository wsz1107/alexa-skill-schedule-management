/* *
 * This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
 * Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */
const Alexa = require('ask-sdk-core');
const msgText = require('./msgText');
const moment = require('moment-timezone');
const admin = require("firebase-admin");
const serviceAccount = require("firebase.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const DB = admin.firestore();

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    async handle(handlerInput) {
        let speakOutput = msgText.WELCOME_MSG;
        
        //firebase
        const snapshot = await DB.collection('schedules').get();
        const quantity = snapshot.docs.length;

        if (quantity === 0) {
            speakOutput += 'まだ予定が設定されていません';
        } else{
            return SayScheduleIntentHandler.handle(handlerInput);
        }
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .addDelegateDirective({
                name:'RegisterScheduleIntent',
                confirmationStatus:'NONE',
                slots:{}
            })
            .reprompt(speakOutput)
            .getResponse();
    }
};

const RegisterScheduleIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'RegisterScheduleIntent';
    },
    async handle(handlerInput) {
        let speakOutput = '';
        const {attributesManager, requestEnvelope} = handlerInput;
        const {intent} = requestEnvelope.request;
        
        if (intent.confirmationStatus === 'CONFIRMED') {
            const scheduleDate = Alexa.getSlotValue(requestEnvelope, 'ScheduleDate');
            const scheduleStartTime = Alexa.getSlotValue(requestEnvelope, 'ScheduleStartTime');
            const scheduleEndTime = Alexa.getSlotValue(requestEnvelope, 'ScheduleEndTime');
            const scheduleTitle = Alexa.getSlotValue(requestEnvelope, 'ScheduleTitle');

            //firebase
            const scheduleRef = DB.collection('schedules');
            const scheduleList = await scheduleRef.get();
            const querySameDateRef = scheduleRef.where('scheduleDate', '==', scheduleDate);
            const scheduleSameDateList = await querySameDateRef.get();
            if (!scheduleSameDateList.empty){
                scheduleSameDateList.forEach(doc => {
                    const tmpReservationStartTime = moment(doc.data().scheduleDate + " " + doc.data().scheduleStartTime);
                    const tmpReservationEndTime = moment(doc.data().scheduleDate + " " + doc.data().scheduleEndTime);
                    const currentReservationStartTime = moment(scheduleDate + " " + scheduleStartTime);
                    if(currentReservationStartTime.isBetween(tmpReservationStartTime,tmpReservationEndTime,undefined,'[)')){
                        speakOutput += 'この時間帯にはすでに予定が入っています。もう一度「予定を入れて」と言ってください。';
                    }
                });
            }else{
                const currentSchedule = {
                    scheduleDate:scheduleDate,
                    scheduleStartTime:scheduleStartTime,
                    scheduleEndTime:scheduleEndTime,
                    scheduleTitle:scheduleTitle,
                    scheduleYear:parseInt(scheduleDate.split('-')[0]),
                    scheduleMonth:parseInt(scheduleDate.split('-')[1]),
                    scheduleDay:parseInt(scheduleDate.split('-')[2]),
                    scheduleStartTimeHour:parseInt(scheduleStartTime.split(':')[0]),
                    scheduleStartTimeMinute:parseInt(scheduleStartTime.split(':')[1])
                };
                //save data in firebase DB 
                try{
                    await scheduleRef.add(currentSchedule);
                }catch(e){
                    console.log(e);
                }
                return SayScheduleIntentHandler.handle(handlerInput);
            }
        }
        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};

const SayDailyScheduleIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SayDailyScheduleIntent';
    },
    async handle(handlerInput){
        const {attributesManager, requestEnvelope} = handlerInput;
        const sessionAttributes = attributesManager.getSessionAttributes();
        let speakOutput = '';
        const targetDate = Alexa.getSlotValue(requestEnvelope, 'ScheduleDate');
        
        const scheduleRef = DB.collection('schedules');
        const scheduleList = await scheduleRef.get();
        const querySameDateRef = scheduleRef.where('scheduleDate', '==', targetDate);
        const scheduleSameDateList = await querySameDateRef.get();
        
        speakOutput += `${targetDate}に、`;
        if(!scheduleSameDateList.empty){
            const quantity = scheduleSameDateList.docs.length;
            speakOutput += `${quantity}件の予定があります。`;
            let ind = 1;
            scheduleSameDateList.forEach(doc => {
                speakOutput += `${ind}件目の予定は、
                            ${doc.data().scheduleDate}、
                            ${doc.data().scheduleStartTime}から${doc.data().scheduleEndTime}まで${doc.data().scheduleTitle}の予定です。`;
                ind++;
            });
        }else{
            speakOutput += 'まだ予定が登録されていません。'
        }
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
}

const SayScheduleIntentHandler = {
    canHandle(handlerInput){
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SayScheduleIntent';
    },
    async handle(handlerInput) {
        let speakOutput = '';
        //firebase
        // const snapshot = await DB.collection('schedules').get();
        const scheduleRef = DB.collection('schedules');
        const snapshot = await scheduleRef.get();
        const orderedReservation = await scheduleRef.orderBy('scheduleYear').orderBy('scheduleMonth').orderBy('scheduleDay').orderBy('scheduleStartTimeHour').orderBy('scheduleStartTimeMinute').get();
        const quantity = snapshot.docs.length;
        let ind = 1;
        
        speakOutput += `計${quantity}件の予定があります。`;
        orderedReservation.forEach(doc => {
            speakOutput += `${ind}件目の予定は、
                            ${doc.data().scheduleDate}、
                            ${doc.data().scheduleStartTime}から${doc.data().scheduleEndTime}まで${doc.data().scheduleTitle}の予定です。`;
            ind++;
        });
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(msgText.REPROMPT_MSG)
            .getResponse();
    }
};

const SayMostRecentReservationIntentHandler = {
    canHandle(handlerInput){
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SayMostRecentReservationIntent';
    },
    async handle(handlerInput) {
        let speakOutput = '';
        
        try{
            const scheduleRef = DB.collection('schedules');
            const mostRecentReservation = await scheduleRef.orderBy('scheduleYear').orderBy('scheduleMonth').orderBy('scheduleDay').orderBy('scheduleStartTimeHour').orderBy('scheduleStartTimeMinute').get();
            let ind = 1;
            mostRecentReservation.forEach(doc =>{
                speakOutput += `${ind}件目の予定は、
                                ${doc.data().scheduleDate}、
                                ${doc.data().scheduleStartTime}から${doc.data().scheduleEndTime}まで${doc.data().scheduleTitle}の予定です。`;
                ind++;
            })
        }catch(e){
            speakOutput += e.toString();
        }
        
        // const speakOutput = `一番近い予定は、${mostRecentReservation.data().scheduleDate}、${mostRecentReservation.data().scheduleStartTime}から${mostRecentReservation.data().scheduleEndTime}まで${mostRecentReservation.data().scheduleTitle}の予定です。`;
        // const speakOutput = `${mostRecentReservation.docs.length}件。`;
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(msgText.REPROMPT_MSG)
            .getResponse();
    }
}

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = msgText.HELP_MSG;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};



const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = msgText.GOODBYE_MSG;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};
/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet 
 * */
const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speakOutput = msgText.FALLBACK_MSG;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};
/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open 
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not 
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs 
 * */
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
    }
};
/* *
 * The intent reflector is used for interaction model testing and debugging.
 * It will simply repeat the intent the user said. You can create custom handlers for your intents 
 * by defining them above, then also adding them to the request handler chain below 
 * */
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You just triggered ${intentName}`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};
/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below 
 * */
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const speakOutput = msgText.ERROR_MSG;
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};


/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom 
 * */
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        RegisterScheduleIntentHandler,
        SayDailyScheduleIntentHandler,
        SayScheduleIntentHandler,
        SayMostRecentReservationIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler)
    .addErrorHandlers(
        ErrorHandler)
    .withCustomUserAgent('sample/hello-world/v1.2')
    .lambda();