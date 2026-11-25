<script setup>
import {ref,watch,computed} from 'vue';
import {useRoute} from 'vue-router';
import {ElMessage} from 'element-plus';
import {fetchAddresses,createOrder} from '../api';
import {formatPrice} from '../utils/format';
const props=defineProps({modelValue:Boolean,item:{type:Object,required:true}});
const emit=defineEmits(['update:modelValue','created']),route=useRoute();
const mode=ref('pickup'),addresses=ref([]),addressId=ref(null),remark=ref(''),busy=ref(false),loading=ref(false),error=ref('');
let addressRevision=0;
const selectedAddress=computed(()=>addresses.value.find(a=>a.id===addressId.value));
const open=computed({get:()=>props.modelValue,set:value=>emit('update:modelValue',value)});
async function load(){const own=++addressRevision;loading.value=true;error.value='';addresses.value=[];addressId.value=null;try{const result=await fetchAddresses();if(own!==addressRevision||!props.modelValue)return;addresses.value=result;addressId.value=(result.find(a=>a.isDefault)||result[0])?.id||null;}catch{if(own===addressRevision)error.value='地址暂时无法加载，请重试。';}finally{if(own===addressRevision)loading.value=false;}}
watch(()=>props.modelValue,value=>{if(value){mode.value='pickup';remark.value='';load();}else{addressRevision++;addresses.value=[];addressId.value=null;loading.value=false;}});
async function submit(){if(busy.value||mode.value==='shipping'&&(loading.value||error.value||!selectedAddress.value))return;busy.value=true;try{await createOrder({itemId:props.item.id,deliveryMode:mode.value,remark:remark.value,...(mode.value==='shipping'?{addressId:addressId.value}:{})});ElMessage.success('订单已创建');open.value=false;emit('created');}catch{}finally{busy.value=false;}}
</script>
<template><el-dialog v-model="open" title="确认交易信息" width="min(560px,94vw)" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy"><div class="checkout-summary"><strong>{{item.title}}</strong><b>{{formatPrice(item.price)}}</b></div><el-form label-position="top"><el-form-item label="交付方式"><el-radio-group v-model="mode"><el-radio-button value="pickup">校内面交</el-radio-button><el-radio-button value="shipping">邮寄收货</el-radio-button></el-radio-group></el-form-item><div v-if="mode==='pickup'" class="order-note">面交地点：{{item.trade_place||'请先与卖家约定'}}。验清物品后再确认收货。</div><div v-else><div v-if="error" class="inline-error">{{error}}<el-button text @click="load">重新加载</el-button></div><el-skeleton v-else-if="loading" :rows="3" animated/><el-radio-group v-else-if="addresses.length" v-model="addressId" class="checkout-addresses"><el-radio v-for="a in addresses" :key="a.id" :value="a.id" border><div><strong>{{a.receiverName}} · {{a.phone}}</strong><small>{{a.province}}{{a.city}}{{a.district}}{{a.detail}}</small><span v-if="a.isDefault">默认地址</span></div></el-radio></el-radio-group><p v-else>还没有收货地址，请先添加。</p><RouterLink class="text-link" :to="{name:'addresses',query:{redirect:route.fullPath}}">管理收货地址</RouterLink></div><el-form-item label="给卖家留言（选填）"><el-input v-model="remark" type="textarea" maxlength="100" show-word-limit :rows="2"/></el-form-item></el-form><p class="order-note">平台记录交易与交付进度，付款、运费和面交安排请与卖家确认。</p><template #footer><el-button :disabled="busy" @click="open=false">再想想</el-button><el-button type="primary" :loading="busy" :disabled="mode==='shipping'&&(!selectedAddress||loading||!!error)" @click="submit">确认下单</el-button></template></el-dialog></template>
