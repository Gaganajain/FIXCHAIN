"""Customer-facing message templates in English, Hindi and Marathi.

Short, spoken-style sentences: acknowledge first, then explain one next step. Templates are the offline/safe
path and the fallback when an LLM is unavailable. Hindi and Marathi copy should be reviewed by native speakers
before production use.
"""
from __future__ import annotations

LOCALES = {"en": "English", "hi": "हिन्दी", "mr": "मराठी"}

T: dict[str, dict[str, str]] = {
    "ack": {
        "en": "Thanks, I've noted your issue: {summary}. Your ticket number is {ticket}.",
        "hi": "धन्यवाद, आपकी समस्या दर्ज हो गई है: {summary}. आपका टिकट नंबर {ticket} है।",
        "mr": "धन्यवाद, तुमची तक्रार नोंदवली आहे: {summary}. तुमचा तिकीट क्रमांक {ticket} आहे.",
    },
    "ask_txn_ref": {
        "en": "Could you share the UTR or transaction reference number? It's the 12-digit number in your payment app's history.",
        "hi": "क्या आप UTR या ट्रांज़ैक्शन रेफ़रेंस नंबर बता सकते हैं? यह आपके पेमेंट ऐप की हिस्ट्री में 12 अंकों का नंबर होता है।",
        "mr": "कृपया UTR किंवा व्यवहार संदर्भ क्रमांक सांगाल का? तो तुमच्या पेमेंट ॲपच्या हिस्ट्रीमध्ये 12 अंकी क्रमांक असतो.",
    },
    "ask_amount": {
        "en": "How much was the payment?",
        "hi": "पेमेंट कितने रुपये का था?",
        "mr": "पेमेंट किती रुपयांचे होते?",
    },
    "ask_approx_time": {
        "en": "Roughly when did this happen? Today, yesterday, or a time is enough.",
        "hi": "यह लगभग कब हुआ? आज, कल, या कोई समय बता दीजिए।",
        "mr": "हे साधारण कधी झाले? आज, काल किंवा वेळ सांगितली तरी चालेल.",
    },
    "never_share": {
        "en": "Please never share your UPI PIN, OTP, CVV or password with anyone, including us.",
        "hi": "कृपया अपना UPI PIN, OTP, CVV या पासवर्ड किसी को भी न बताएं, हमें भी नहीं।",
        "mr": "कृपया तुमचा UPI PIN, OTP, CVV किंवा पासवर्ड कोणालाही सांगू नका, आम्हालाही नाही.",
    },
    "checking": {
        "en": "I'm checking this now. I'll update you here as soon as I have a verified result.",
        "hi": "मैं अभी इसकी जाँच कर रहा हूँ। पक्का नतीजा मिलते ही यहीं बताऊँगा।",
        "mr": "मी आत्ता हे तपासत आहे. खात्रीशीर निकाल मिळताच इथेच कळवतो.",
    },
    "linked_incident": {
        "en": "We've found other customers with the same problem, so our team is working on it as one incident ({incident}). You don't need to raise it again.",
        "hi": "दूसरे ग्राहकों को भी यही समस्या आ रही है, इसलिए हमारी टीम इसे एक साथ ({incident}) सुलझा रही है। आपको दोबारा शिकायत करने की ज़रूरत नहीं है।",
        "mr": "इतर ग्राहकांनाही हीच अडचण येत आहे, म्हणून आमची टीम यावर एकत्र ({incident}) काम करत आहे. तुम्हाला पुन्हा तक्रार करण्याची गरज नाही.",
    },
    "pay_status_SUCCESS_MERCHANT_FAILED": {
        "en": "I checked: your bank shows the ₹{amount} payment as successful, but the merchant's system did not record it. This is being fixed on our side. Your money is not lost.",
        "hi": "मैंने जाँच की: बैंक में ₹{amount} का पेमेंट सफल दिख रहा है, पर मर्चेंट के सिस्टम में दर्ज नहीं हुआ। इसे हमारी तरफ़ से ठीक किया जा रहा है। आपका पैसा सुरक्षित है।",
        "mr": "मी तपासले: बँकेत ₹{amount} चे पेमेंट यशस्वी दिसत आहे, पण व्यापाऱ्याच्या सिस्टममध्ये नोंद झाली नाही. हे आमच्या बाजूने दुरुस्त केले जात आहे. तुमचे पैसे सुरक्षित आहेत.",
    },
    "pay_status_PENDING": {
        "en": "Your ₹{amount} payment is still pending with the bank. Pending payments usually settle on their own; I'll keep watching and update you.",
        "hi": "आपका ₹{amount} का पेमेंट अभी बैंक में पेंडिंग है। पेंडिंग पेमेंट अक्सर अपने आप पूरे हो जाते हैं; मैं नज़र रखूँगा और बताऊँगा।",
        "mr": "तुमचे ₹{amount} चे पेमेंट अजून बँकेत प्रलंबित आहे. असे पेमेंट बहुतेक आपोआप पूर्ण होते; मी लक्ष ठेवून कळवतो.",
    },
    "pay_status_FAILED": {
        "en": "The bank shows this ₹{amount} payment as failed. If money left your account, the bank reverses failed payments; I've raised a request for our team to confirm it.",
        "hi": "बैंक में यह ₹{amount} का पेमेंट फेल दिख रहा है। अगर पैसा कटा है तो बैंक उसे वापस करता है; मैंने हमारी टीम को इसकी पुष्टि के लिए अनुरोध भेजा है।",
        "mr": "बँकेत हे ₹{amount} चे पेमेंट अयशस्वी दिसत आहे. पैसे कापले असतील तर बँक ते परत करते; याची खात्री करण्यासाठी मी आमच्या टीमला विनंती पाठवली आहे.",
    },
    "pay_status_SUCCESS": {
        "en": "I checked: the ₹{amount} payment is successful and the merchant has received it.",
        "hi": "मैंने जाँच की: ₹{amount} का पेमेंट सफल है और मर्चेंट को मिल गया है।",
        "mr": "मी तपासले: ₹{amount} चे पेमेंट यशस्वी आहे आणि व्यापाऱ्याला मिळाले आहे.",
    },
    "pay_status_UNKNOWN": {
        "en": "I couldn't confirm this payment's status right now, so I won't guess. A specialist will check and get back to you.",
        "hi": "अभी मैं इस पेमेंट की स्थिति पक्की नहीं कर पाया, इसलिए अंदाज़ा नहीं लगाऊँगा। एक विशेषज्ञ जाँच करके आपको बताएगा।",
        "mr": "आत्ता मी या पेमेंटची स्थिती निश्चित करू शकलो नाही, म्हणून अंदाज लावणार नाही. तज्ज्ञ तपासून तुम्हाला कळवतील.",
    },
    "soundbox_restart": {
        "en": "Your Soundbox has lost its network connection. I've sent it a safe remote restart. Please keep it switched on and plugged in for two minutes.",
        "hi": "आपके साउंडबॉक्स का नेटवर्क कनेक्शन टूट गया है। मैंने उसे सुरक्षित रिमोट रीस्टार्ट भेजा है। कृपया दो मिनट तक उसे चालू और चार्जिंग पर रखें।",
        "mr": "तुमच्या साउंडबॉक्सचे नेटवर्क कनेक्शन तुटले आहे. मी त्याला सुरक्षित रिमोट रीस्टार्ट पाठवला आहे. कृपया दोन मिनिटे तो चालू आणि चार्जिंगला ठेवा.",
    },
    "soundbox_battery": {
        "en": "Your Soundbox battery is very low. Please plug in the charger. It should start announcing again in a few minutes.",
        "hi": "आपके साउंडबॉक्स की बैटरी बहुत कम है। कृपया चार्जर लगाइए। कुछ मिनट में यह फिर से बोलने लगेगा।",
        "mr": "तुमच्या साउंडबॉक्सची बॅटरी खूप कमी आहे. कृपया चार्जर लावा. काही मिनिटांत तो पुन्हा बोलू लागेल.",
    },
    "soundbox_online_defect": {
        "en": "Your Soundbox is online and working. The missing announcements come from a payment-status problem on our side, which our engineers are fixing. Your payments are safe.",
        "hi": "आपका साउंडबॉक्स ऑनलाइन है और ठीक चल रहा है। घोषणा न होने की वजह हमारी तरफ़ के पेमेंट-स्टेटस की गड़बड़ी है, जिसे हमारे इंजीनियर ठीक कर रहे हैं। आपके पेमेंट सुरक्षित हैं।",
        "mr": "तुमचा साउंडबॉक्स ऑनलाइन आणि व्यवस्थित आहे. घोषणा न होण्याचे कारण आमच्या बाजूची पेमेंट-स्टेटस अडचण आहे, जी आमचे इंजिनिअर दुरुस्त करत आहेत. तुमची पेमेंट सुरक्षित आहेत.",
    },
    "soundbox_fixed": {
        "en": "Your Soundbox is back online and the test announcement worked. Thanks for your patience!",
        "hi": "आपका साउंडबॉक्स फिर से ऑनलाइन है और टेस्ट घोषणा ठीक हुई। धैर्य के लिए धन्यवाद!",
        "mr": "तुमचा साउंडबॉक्स पुन्हा ऑनलाइन आहे आणि चाचणी घोषणा व्यवस्थित झाली. संयमाबद्दल धन्यवाद!",
    },
    "qr_config": {
        "en": "Your QR code is linked to an inactive payment account after a recent update. Re-linking it needs a quick approval from our team. I've requested it.",
        "hi": "हाल के अपडेट के बाद आपका QR कोड एक बंद पेमेंट अकाउंट से जुड़ गया है। इसे दोबारा जोड़ने के लिए हमारी टीम की मंज़ूरी चाहिए। मैंने अनुरोध भेज दिया है।",
        "mr": "अलीकडच्या अपडेटनंतर तुमचा QR कोड बंद पेमेंट खात्याशी जोडला गेला आहे. तो पुन्हा जोडण्यासाठी आमच्या टीमची मंजुरी लागते. मी विनंती पाठवली आहे.",
    },
    "qr_ok": {
        "en": "I checked your QR configuration and it looks correct. Please try a test payment of ₹1. If it still fails, I'll pass this to a specialist.",
        "hi": "मैंने आपके QR की सेटिंग जाँची, वह सही है। कृपया ₹1 का टेस्ट पेमेंट करके देखें। फिर भी दिक्कत हो तो मैं इसे विशेषज्ञ को दूँगा।",
        "mr": "मी तुमच्या QR ची सेटिंग तपासली, ती बरोबर आहे. कृपया ₹1 चे चाचणी पेमेंट करून पहा. तरीही अडचण आली तर मी हे तज्ज्ञांकडे देईन.",
    },
    "settlement_partner": {
        "en": "Your settlement of ₹{amount} is held at the partner bank. We've raised it with them and need their confirmation before it can move. I'll update you.",
        "hi": "आपका ₹{amount} का सेटलमेंट पार्टनर बैंक पर रुका है। हमने उनसे बात शुरू कर दी है और उनकी पुष्टि के बाद ही यह आगे बढ़ेगा। मैं आपको अपडेट दूँगा।",
        "mr": "तुमचे ₹{amount} चे सेटलमेंट पार्टनर बँकेत अडकले आहे. आम्ही त्यांच्याशी संपर्क केला आहे आणि त्यांच्या पुष्टीनंतरच ते पुढे जाईल. मी तुम्हाला कळवतो.",
    },
    "approval_pending": {
        "en": "The next step needs approval from an authorised team member. I've sent the request with all the details.",
        "hi": "अगले कदम के लिए अधिकृत टीम सदस्य की मंज़ूरी चाहिए। मैंने सारी जानकारी के साथ अनुरोध भेज दिया है।",
        "mr": "पुढच्या टप्प्यासाठी अधिकृत टीम सदस्याची मंजुरी लागते. मी सर्व माहितीसह विनंती पाठवली आहे.",
    },
    "resolved": {
        "en": "Good news: this is resolved and we've verified it. {detail}",
        "hi": "अच्छी खबर: यह समस्या सुलझ गई है और हमने इसकी पुष्टि कर ली है। {detail}",
        "mr": "आनंदाची बातमी: ही अडचण सुटली आहे आणि आम्ही त्याची खात्री केली आहे. {detail}",
    },
    "escalated": {
        "en": "I've passed this to a specialist with everything you told me, so you won't need to repeat it. They'll contact you here.",
        "hi": "मैंने आपकी पूरी जानकारी के साथ इसे विशेषज्ञ को भेज दिया है, आपको दोबारा बताना नहीं पड़ेगा। वे यहीं आपसे संपर्क करेंगे।",
        "mr": "तुम्ही सांगितलेल्या सर्व माहितीसह मी हे तज्ज्ञांकडे पाठवले आहे, तुम्हाला पुन्हा सांगावे लागणार नाही. ते इथेच तुमच्याशी संपर्क साधतील.",
    },
    "fraud_urgent": {
        "en": "I'm sorry this happened. I've flagged it as urgent for our fraud team. Please call your bank to block the instrument and report it at 1930 or cybercrime.gov.in. Don't share any OTP or PIN.",
        "hi": "यह सुनकर दुख हुआ। मैंने इसे हमारी फ़्रॉड टीम के लिए अर्जेंट मार्क किया है। कृपया अपने बैंक को कॉल करके कार्ड/UPI ब्लॉक कराएँ और 1930 या cybercrime.gov.in पर शिकायत करें। कोई OTP या PIN न बताएँ।",
        "mr": "हे झाल्याबद्दल खेद वाटतो. मी हे आमच्या फ्रॉड टीमसाठी तातडीचे म्हणून नोंदवले आहे. कृपया तुमच्या बँकेला फोन करून कार्ड/UPI ब्लॉक करा आणि 1930 किंवा cybercrime.gov.in वर तक्रार करा. कोणताही OTP किंवा PIN सांगू नका.",
    },
    "outage": {
        "en": "We're aware of a service disruption affecting several customers and are working on it now. Your ticket is linked, and we'll update you here.",
        "hi": "हमें एक सेवा बाधा की जानकारी है जिससे कई ग्राहक प्रभावित हैं, और हम इस पर काम कर रहे हैं। आपका टिकट इससे जुड़ा है, हम यहीं अपडेट देंगे।",
        "mr": "अनेक ग्राहकांवर परिणाम करणाऱ्या सेवा अडचणीची आम्हाला माहिती आहे आणि आम्ही त्यावर काम करत आहोत. तुमचे तिकीट त्याच्याशी जोडले आहे, आम्ही इथेच कळवू.",
    },
    "secret_warning": {
        "en": "For your safety I've hidden that number. Please never share OTPs or PINs.",
        "hi": "आपकी सुरक्षा के लिए मैंने वह नंबर छिपा दिया है। कृपया OTP या PIN कभी न बताएँ।",
        "mr": "तुमच्या सुरक्षेसाठी मी तो क्रमांक लपवला आहे. कृपया OTP किंवा PIN कधीही सांगू नका.",
    },
    "soundbox_ok": {
        "en": "Your Soundbox is online and the test announcement played. Could you make a ₹1 test payment and tell me if you hear it?",
        "hi": "आपका साउंडबॉक्स ऑनलाइन है और टेस्ट घोषणा चली। क्या आप ₹1 का टेस्ट पेमेंट करके बताएँगे कि आवाज़ आई या नहीं?",
        "mr": "तुमचा साउंडबॉक्स ऑनलाइन आहे आणि चाचणी घोषणा वाजली. ₹1 चे चाचणी पेमेंट करून आवाज आला का ते सांगाल का?",
    },
    "eng_fixed": {
        "en": "Our engineers have fixed the payment-status problem and we've verified the fix. Announcements and order updates work again.",
        "hi": "हमारे इंजीनियरों ने पेमेंट-स्टेटस की गड़बड़ी ठीक कर दी है और हमने इसकी जाँच कर ली है। घोषणाएँ और ऑर्डर अपडेट फिर से ठीक काम कर रहे हैं।",
        "mr": "आमच्या इंजिनिअरनी पेमेंट-स्टेटसची अडचण दुरुस्त केली आहे आणि आम्ही ती तपासली आहे. घोषणा आणि ऑर्डर अपडेट पुन्हा व्यवस्थित चालू आहेत.",
    },
    "vision_network": {
        "en": "The red light means your Soundbox has no network. Switch it off, wait 10 seconds and switch it on again, near a window if you can.",
        "hi": "लाल बत्ती का मतलब है साउंडबॉक्स में नेटवर्क नहीं है। इसे बंद करें, 10 सेकंड रुकें और फिर चालू करें, हो सके तो खिड़की के पास रखें।",
        "mr": "लाल दिवा म्हणजे साउंडबॉक्सला नेटवर्क नाही. तो बंद करा, 10 सेकंद थांबा आणि पुन्हा चालू करा, शक्य असल्यास खिडकीजवळ ठेवा.",
    },
    "vision_unknown": {
        "en": "I can't tell the device state from this photo, so I won't guess. A specialist will take a look.",
        "hi": "इस फ़ोटो से मैं डिवाइस की स्थिति नहीं समझ पा रहा, इसलिए अंदाज़ा नहीं लगाऊँगा। एक विशेषज्ञ इसे देखेंगे।",
        "mr": "या फोटोवरून मला डिव्हाइसची स्थिती समजत नाही, म्हणून अंदाज लावणार नाही. तज्ज्ञ ते पाहतील.",
    },
    "detail_recon": {
        "en": "The merchant's record now shows your payment as PAID.",
        "hi": "मर्चेंट के रिकॉर्ड में अब आपका पेमेंट PAID दिख रहा है।",
        "mr": "व्यापाऱ्याच्या नोंदीत आता तुमचे पेमेंट PAID दिसत आहे.",
    },
    "detail_qr": {
        "en": "Your QR is linked to the active account again.",
        "hi": "आपका QR फिर से सक्रिय अकाउंट से जुड़ गया है।",
        "mr": "तुमचा QR पुन्हा सक्रिय खात्याशी जोडला आहे.",
    },
    "detail_settlement": {
        "en": "The partner bank released your settlement batch.",
        "hi": "पार्टनर बैंक ने आपका सेटलमेंट बैच जारी कर दिया है।",
        "mr": "पार्टनर बँकेने तुमचा सेटलमेंट बॅच मोकळा केला आहे.",
    },
    "detail_settled": {
        "en": "Settlement {batch} of ₹{amount} was credited (ref {utr}).",
        "hi": "₹{amount} का सेटलमेंट {batch} जमा हो चुका है (रेफ़ {utr})।",
        "mr": "₹{amount} चे सेटलमेंट {batch} जमा झाले आहे (संदर्भ {utr}).",
    },
    "detail_failover": {
        "en": "Payments are flowing normally again after we switched to our backup gateway.",
        "hi": "बैकअप गेटवे पर स्विच करने के बाद पेमेंट फिर से सामान्य रूप से हो रहे हैं।",
        "mr": "बॅकअप गेटवेवर स्विच केल्यानंतर पेमेंट पुन्हा व्यवस्थित होत आहेत.",
    },
    "detail_retry": {
        "en": "Our services are healthy now; please try again.",
        "hi": "हमारी सेवाएँ अब ठीक चल रही हैं; कृपया फिर से कोशिश करें।",
        "mr": "आमच्या सेवा आता व्यवस्थित आहेत; कृपया पुन्हा प्रयत्न करा.",
    },
    "thanks_field": {
        "en": "Thank you, that helps.",
        "hi": "धन्यवाद, इससे मदद मिलेगी।",
        "mr": "धन्यवाद, याने मदत होईल.",
    },
}


SYMPTOM_LABELS: dict[str, dict[str, str]] = {
    "DEBIT_NOT_CREDITED": {"hi": "पैसे कटे पर मर्चेंट को नहीं मिले", "mr": "पैसे कापले पण व्यापाऱ्याला मिळाले नाहीत"},
    "PAYMENT_PENDING": {"hi": "पेमेंट पेंडिंग है", "mr": "पेमेंट प्रलंबित आहे"},
    "PAYMENT_FAILED": {"hi": "पेमेंट फेल हुआ", "mr": "पेमेंट अयशस्वी झाले"},
    "DUPLICATE_DEBIT": {"hi": "दो बार पैसे कटे", "mr": "दोनदा पैसे कापले"},
    "REFUND_STATUS": {"hi": "रिफंड की स्थिति", "mr": "परताव्याची स्थिती"},
    "QR_NOT_ACCEPTING": {"hi": "QR से पेमेंट नहीं हो रहा", "mr": "QR वरून पेमेंट होत नाही"},
    "SOUNDBOX_NO_ANNOUNCEMENT": {"hi": "साउंडबॉक्स पेमेंट की घोषणा नहीं कर रहा", "mr": "साउंडबॉक्स पेमेंटची घोषणा करत नाही"},
    "SOUNDBOX_OFFLINE": {"hi": "साउंडबॉक्स ऑफ़लाइन है", "mr": "साउंडबॉक्स ऑफलाइन आहे"},
    "SETTLEMENT_DELAY": {"hi": "सेटलमेंट में देरी", "mr": "सेटलमेंटला उशीर"},
    "SETTLEMENT_MISMATCH": {"hi": "सेटलमेंट की रकम में अंतर", "mr": "सेटलमेंट रकमेत फरक"},
    "LOGIN_FAILURE": {"hi": "लॉगिन नहीं हो रहा", "mr": "लॉगिन होत नाही"},
    "KYC_ISSUE": {"hi": "KYC से जुड़ी समस्या", "mr": "KYC संबंधी अडचण"},
    "FRAUD_UNAUTHORIZED": {"hi": "बिना अनुमति का लेन-देन", "mr": "परवानगीशिवाय व्यवहार"},
    "APP_OUTAGE": {"hi": "सेवा उपलब्ध नहीं", "mr": "सेवा उपलब्ध नाही"},
    "REPEAT_COMPLAINT": {"hi": "समस्या अब तक हल नहीं हुई", "mr": "अडचण अजून सुटलेली नाही"},
    "DATA_EXPOSURE": {"hi": "डेटा सुरक्षा की चिंता", "mr": "डेटा सुरक्षेची चिंता"},
}


def symptom_label(code: str | None, locale: str, fallback: str) -> str:
    if locale == "en" or not code:
        return fallback
    return SYMPTOM_LABELS.get(code, {}).get(locale, fallback)


def t(key: str, locale: str, **kw) -> str:
    table = T.get(key, {})
    s = table.get(locale) or table.get("en") or key
    try:
        return s.format(**kw)
    except (KeyError, IndexError):
        return s
