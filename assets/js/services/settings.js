import { getOne, set } from "./firestore.js";
import { COLLECTIONS } from "../config/collections.js";
export const DEFAULT_SETTINGS={
 general:{siteName:"CAC Agbara Aanu Sioni Radio",contactEmail:"",contactPhone:"",whatsappNumber:"",address:"",country:"Nigeria"},
 radio:{stationName:"CAC Agbara Aanu Sioni Radio",publicStreamUrl:"",defaultVolume:.8},
 social:{facebook:"",instagram:"",youtube:"",tiktok:"",x:""},
 appearance:{defaultTheme:"light"}
};
export async function getSettings(){return (await getOne(COLLECTIONS.SETTINGS,"application"))||DEFAULT_SETTINGS;}
export async function saveSettings(data){return set(COLLECTIONS.SETTINGS,"application",data,true);}
