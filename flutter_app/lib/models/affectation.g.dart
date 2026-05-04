part of 'affectation.dart';

AffectationType _$AffectationTypeFromJson(String value) {
  switch (value) {
    case 'primary':
      return AffectationType.primary;
    case 'secondary':
      return AffectationType.secondary;
    case 'temporary':
      return AffectationType.temporary;
    default:
      throw ArgumentError.value(value, 'value', 'Unsupported AffectationType');
  }
}

String _$AffectationTypeToJson(AffectationType value) => value.name;

Affectation _$AffectationFromJson(Map<String, dynamic> json) => Affectation(
      id: (json['id'] as num).toInt(),
      staffId: (json['staffId'] as num).toInt(),
      serviceId: (json['serviceId'] as num).toInt(),
      serviceName: json['serviceName'] as String,
      poleId: (json['poleId'] as num).toInt(),
      poleName: json['poleName'] as String,
      equipeId: (json['equipeId'] as num).toInt(),
      equipeName: json['equipeName'] as String,
      posteId: (json['posteId'] as num).toInt(),
      posteName: json['posteName'] as String,
      type: _$AffectationTypeFromJson(json['type'] as String),
      startDate: DateTime.parse(json['startDate'] as String),
      endDate: json['endDate'] == null
          ? null
          : DateTime.parse(json['endDate'] as String),
      isActive: json['isActive'] as bool? ?? true,
      notes: json['notes'] as String?,
      allocationPercentage: (json['allocationPercentage'] as num?)?.toDouble(),
      createdAt: json['createdAt'] == null
          ? null
          : DateTime.parse(json['createdAt'] as String),
      updatedAt: json['updatedAt'] == null
          ? null
          : DateTime.parse(json['updatedAt'] as String),
    );

Map<String, dynamic> _$AffectationToJson(Affectation instance) =>
    <String, dynamic>{
      'id': instance.id,
      'staffId': instance.staffId,
      'serviceId': instance.serviceId,
      'serviceName': instance.serviceName,
      'poleId': instance.poleId,
      'poleName': instance.poleName,
      'equipeId': instance.equipeId,
      'equipeName': instance.equipeName,
      'posteId': instance.posteId,
      'posteName': instance.posteName,
      'type': _$AffectationTypeToJson(instance.type),
      'startDate': instance.startDate.toIso8601String(),
      'endDate': instance.endDate?.toIso8601String(),
      'isActive': instance.isActive,
      'notes': instance.notes,
      'allocationPercentage': instance.allocationPercentage,
      'createdAt': instance.createdAt?.toIso8601String(),
      'updatedAt': instance.updatedAt?.toIso8601String(),
    };
