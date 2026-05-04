part of 'login_response.dart';

LoginResponse _$LoginResponseFromJson(Map<String, dynamic> json) =>
    LoginResponse(
      id: (json['id'] as num).toInt(),
      email: json['email'] as String,
      role: json['role'] as String,
      token: json['token'] as String,
      serviceId: (json['serviceId'] as num?)?.toInt(),
      serviceNom: json['serviceNom'] as String?,
      poleId: (json['poleId'] as num?)?.toInt(),
      poleNom: json['poleNom'] as String?,
      equipeId: (json['equipeId'] as num?)?.toInt(),
      equipeNom: json['equipeNom'] as String?,
    );

Map<String, dynamic> _$LoginResponseToJson(LoginResponse instance) =>
    <String, dynamic>{
      'id': instance.id,
      'email': instance.email,
      'role': instance.role,
      'token': instance.token,
      'serviceId': instance.serviceId,
      'serviceNom': instance.serviceNom,
      'poleId': instance.poleId,
      'poleNom': instance.poleNom,
      'equipeId': instance.equipeId,
      'equipeNom': instance.equipeNom,
    };
