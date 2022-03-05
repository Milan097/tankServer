const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();


exports.entry = functions.https.onCall(async (data, context) => {
	
	const roomDataRef = await admin.firestore().collection('room');
	const result = await roomDataRef.doc('meta').get().then(function(doc) {
		return doc.data();
	}).catch(function(error) {
		console.log("Error getting meta document:", error);
	});

	const userDataRef = await admin.firestore().collection('users');
	
	const userData = await userDataRef.doc(context.auth.uid).get().then(function(doc) {
		return doc.data();
	}).catch(function(error) {
		console.log("Error getting user document:", error);
	});
	
	//calculate user level
	var levelOfPlayer = userData.level/10 + 1;
	if((userData.level)%10 === 0){
		levelOfPlayer -= 1 ;
	}
	var level = parseInt(levelOfPlayer);
	var roomId = result[level];
	
	
	var roomDoc = await admin.firestore().collection('room').doc(roomId);
	// var playerDoc = await roomDoc.collection('players').doc(context.auth.uid);
	
	admin.firestore().runTransaction(async function(transaction) {
		return transaction.get(roomDoc).then(function(sfDoc) {
			var newNumber = sfDoc.data().number + 1		
			const nowDate = new Date();
			
			if(newNumber > 6)
				return;
			
			var userState = {
				[context.auth.uid] : ''
			}
			
			transaction.update(roomDoc, userState);
			transaction.update(roomDoc, {number : newNumber});
		
			// var mp = data.tank;
			// transaction.set(playerDoc, mp);
			// transaction.update(playerDoc, {uid : context.auth.uid});
			
			//if last player add then also change 'isWaiting' and remove document id from meta
			if(newNumber === 6){
				transaction.update(roomDoc, {'isWaiting':'false'});
				transaction.update(roomDataRef.doc('meta'), {[level]:""});
			} else if(newNumber === 1){
				//if 1 player add then set time for room	
				transaction.update(roomDoc, {'time': nowDate.getTime()});
			}				
			return;
		});
	}).then(function() {
		console.log("Transaction successfully committed!");
		return;
	}).catch(function(error) {
		console.log("Transaction failed: ", error);
	});
	console.log('Success in Entry Function');
	
	//return roomid 
	return {'room':roomId};
});


//AddEmptyDocument
 exports.addEmptyDocument = functions.firestore.document('room/meta').onUpdate(async (change, context) => {
	
	const roomDataRef = await admin.firestore().collection('room');
	const newValue = change.after.data();
	
	for(const key in newValue) {
		if(newValue[key] === "") {	
			var map = {
				'isWaiting':'true',
				'number':0,
				'time':0
			}
			
			// genarate unique roomId
			var roomRef = admin.firestore().collection('room').doc();
			admin.firestore().collection('room').doc(roomRef.id).set(map);
			admin.firestore().collection('room').doc('meta').update({
					[key]:roomRef.id,
				});	
		}
	}
});



//CancleRequest
exports.cancleRequest = functions.https.onCall(async (data, context) => {
	
	const roomRef = await admin.firestore().collection('room').doc(data.roomId);
	const dataRoom = await roomRef.get().then(function(doc) {
		return doc.data();
	}).catch(function(error) {
		console.log("Error getting document:", error);
	});
	
	// const playerRef = await admin.firestore().collection('room').doc(data.roomId).collection('players').doc(context.auth.uid);

	admin.firestore().runTransaction(async function(transaction) {
		return transaction.get(roomRef).then(function(sfDoc) {
				var d = sfDoc.data();
				
				transaction.update(roomRef,{[context.auth.uid]: firebase.firestore.FieldValue.delete()});
				transaction.update(roomRef,{'number':d['number'] - 1});	
						
				// transaction.delete(playerRef);
				return;
		});
	}).then(function() {
		console.log("Transaction successfully committed!");
		return;
	}).catch(function(error) {
		console.log("Transaction failed: ", error);
	});
	
	
	console.log("Success in CancleRequest Function");
	return {'cancel' : 'success'};
});


//MachingQueue
exports.matchingQueue = functions.https.onCall(async (data,context) => {
	
	const roomRefe = await admin.firestore().collection('room');
	const userRef = await admin.firestore().collection('users');
	const roomMetaRef = await admin.firestore().collection('room').doc('meta');
	
	const result = await roomMetaRef.get().then(function(doc) {
		return doc.data();
	}).catch(function(error) {
		console.log("Error getting document:", error);
	});
	
	const roomRef =  await admin.firestore().collection('room').doc(data.roomId);
	
	var dataRoom = await roomRef.get().then(function(doc) {
		return doc.data();
	}).catch(function(error) {
		console.log("Error getting document:", error);
	});
	
	//find roomId in meta document 
	var i = 1;
	for(i = 1;i < 10;i++){
		if(result[i] === data.roomId){
			break;
		}
	}
	
	//find upper Room reference and data
	var upperDoc,downDoc,upperDocRef,downDocRef;
	var upperDocNumber = 0,downDocNumber = 0;
	if(i > 1){
		upperDocRef = await admin.firestore().collection('room').doc(result[i-1]);
		upperDoc = await admin.firestore().collection('room').doc(result[i-1]).get().then(function(doc) {
				return doc.data();
		}).catch(function(error) {
			console.log("Error getting document:", error);
		});
		upperDocNumber = upperDoc['number'];
	}
	
	//find down Room reference and data
	if(i < 10){
		downDocRef = await admin.firestore().collection('room').doc(result[i+1]);
		downDoc = await admin.firestore().collection('room').doc(result[i+1]).get().then(function(doc) {
				return doc.data();
		}).catch(function(error) {
			console.log("Error getting document:", error);
		});
		downDocNumber = downDoc['number'];
	}
	
	var averageLevel;
	// console.log(dataRoom);
	let keys = Array.from( Object.keys(dataRoom) );
	
	var ind = keys.indexOf('isWaiting');
	keys.splice(ind, 1);
	ind = keys.indexOf('number');
	keys.splice(ind, 1);
	ind = keys.indexOf('time');
	keys.splice(ind, 1);
	var m = 0;
	for(m = 0;m < keys.length;m++) {
		userRef.doc(keys[m]).get().then(function(doc) {
			averageLevel += doc.data()['level'];
			return doc.data();
		}).catch(function(error) {
			console.log("Error getting document:", error);
		});
	}
	
	//run transaction
	await admin.firestore().runTransaction(async function(transaction) {
		var j = 1;
		var flag = '1';
		var numberOfTransfer;
		return transaction.get(roomRef).then(function(sfDoc) {
			
			//find total user in room
			numberOfTransfer = sfDoc.data().number;
			
			averageLevel = averageLevel/numberOfTransfer;
			//if total user in room is greater then 4 then game start
			if(numberOfTransfer >= 4 && sfDoc.data().isWaiting === 'true'){
				transaction.update(roomRef,{ 'isWaiting' :'false'});			
				transaction.update(roomMetaRef,{ [i] :""});
				flag = '0';
			} else {
				if(numberOfTransfer === 3){
					if(averageLevel/10 > (i-0.5)){
						if(downDoc !== null && downDocNumber <= 3 && downDocNumber >= 1){
							flag = 'd';
						} else if(upperDoc !== null && upperDocNumber <= 3 && upperDocNumber >=1){
							flag = 'u';
						} else{
							transaction.update(roomRef,{ 'isWaiting' :'false'});			
							transaction.update(roomMetaRef,{ [i] :""});
							flag = '0';
						}
					}
					else{
						if(upperDoc !== null && upperDocNumber <= 3 && upperDocNumber >=1){
							flag = 'u';
						} else if(downDoc !== null && downDocNumber <= 3 && downDocNumber >= 1){
							flag = 'd';
						} else{
							transaction.update(roomRef,{ 'isWaiting' :'false'});			
							transaction.update(roomMetaRef,{ [i] :""});
							flag = '0';
						}
					}	
				} else if(numberOfTransfer === 2){
					if(averageLevel/10 > (i-0.5)){
						if(downDoc !== null && downDocNumber <= 4 && downDocNumber >= 1){
							flag = 'd';
						}else if(upperDoc !== null && upperDocNumber <= 4 && upperDocNumber >=1){
							flag = 'u';
						}else{
							transaction.update(roomRef,{ 'isWaiting' :'false'});			
							transaction.update(roomMetaRef,{ [i] :""});
							flag = '0';
						}
					}else{
						if(upperDoc !== null && upperDocNumber <= 4 && upperDocNumber >=1){
							flag = 'u';
						}else if(downDoc !== null && downDocNumber <= 4 && downDocNumber >= 1){
							flag = 'd';
						}else{
							transaction.update(roomRef,{ 'isWaiting' :'false'});			
							transaction.update(roomMetaRef,{ [i] :""});
							flag = '0';
						}
					}
				} else if(numberOfTransfer === 1){
					if(averageLevel/10 > (i-0.5)){
						if(upperDoc !== null && upperDocNumber <= 5 && upperDocNumber >=1){
							flag = 'u';
						}else if(downDoc !== null && downDocNumber <= 5 && downDocNumber >= 1){
							flag = 'd';
						}
					}else{
						if(downDoc !== null && downDocNumber <= 5 && downDocNumber >= 1){
							flag = 'd';
						}else if(upperDoc !== null && upperDocNumber <= 5 && upperDocNumber >=1){
							flag = 'u';
						}
					}
				}
				
				//transfer data in appropriate room 
				//if flag is 'u' then transfer in upper room 
				//if flag is 'd' then transfer in down room
				//if flag is '0' then no transfer data and start the game
				var dataDoc1,referrer;
				if(flag === 'u'){
					j = 1;
					for(j = 1; j <= numberOfTransfer;j++){
						upperDocNumber+=1;
						transaction.update(upperDocRef, {[keys[j-1]] : ""});	
					}
					transaction.update(upperDocRef, { 'number' : upperDocNumber});
					
					//change status of 'isWaiting' to transfer room id
					transaction.update(roomRef,{'isWaiting':result[i-1]});
					transaction.update(upperDocRef,{'merge':result[i]});
					transaction.update(roomMetaRef,{[i-1]:""});
					transaction.update(roomMetaRef,{[i]:""});
					
					//start game
					transaction.update(upperDocRef,{'isWaiting':'false'});
					
				}else if(flag === 'd'){
					
					j = 1;
					for(j = 1; j <= numberOfTransfer;j++){					
						downDocNumber+=1;
						transaction.update(downDocRef, {[keys[j-1]] : ""});
					}
					transaction.update(downDocRef, { 'number' : downDocNumber});
					
					//change status of 'isWaiting' to transfer room id
					transaction.update(roomRef,{'isWaiting':result[i+1]});
					transaction.update(downDocRef,{'merge':result[i]});
					transaction.update(roomMetaRef,{[i+1]:""});
					transaction.update(roomMetaRef,{[i]:""});
					
					//start game
					transaction.update(downDocRef,{'isWaiting':'false'});
					
				}else if(flag === '0'){
					transaction.update(roomRef,{'isWaiting':'false'});
					transaction.update(roomMetaRef,{[i]:""});
				}
			
			}	
				
			return;
		});
		
	}).then(function() {
		console.log("Transaction successfully committed!");
		return;
	}).catch(function(error) {
		console.log("Transaction failed: ", error);
	});
	
	
});

