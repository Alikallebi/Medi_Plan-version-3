part of 'user_context.dart';

UserContext _$UserContextFromJson(Map<String, dynamic> json) => UserContext(
      userId: (json['userId'] as num).toInt(),
      userNom: json['userNom'] as String,
      userPrenom: json['userPrenom'] as String,
      userEmail: json['userEmail'] as String,
      userRole: json['userRole'] as String,
      serviceId: (json['serviceId'] as num?)?.toInt(),
      serviceNom: json['serviceNom'] as String?,
      poleId: (json['poleId'] as num?)?.toInt(),
      poleNom: json['poleNom'] as String?,
      equipeId: (json['equipeId'] as num?)?.toInt(),
      equipeNom: json['equipeNom'] as String?,
      permissions: List<String>.from(json['permissions'] as List),
      metadata: Map<String, dynamic>.from(json['metadata'] as Map),
    );

Map<String, dynamic> _$UserContextToJson(UserContext instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'userNom': instance.userNom,
      'userPrenom': instance.userPrenom,
      'userEmail': instance.userEmail,
      'userRole': instance.userRole,
      'serviceId': instance.serviceId,
      'serviceNom': instance.serviceNom,
      'poleId': instance.poleId,
      'poleNom': instance.poleNom,
      'equipeId': instance.equipeId,
      'equipeNom': instance.equipeNom,
      'permissions': instance.permissions,
      'metadata': instance.metadata,
    };
