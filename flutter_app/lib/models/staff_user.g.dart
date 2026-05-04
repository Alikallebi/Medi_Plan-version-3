part of 'staff_user.dart';

StaffUser _$StaffUserFromJson(Map<String, dynamic> json) => StaffUser(
      id: (json['id'] as num).toInt(),
      nom: json['nom'] as String,
      prenom: json['prenom'] as String,
      email: json['email'] as String,
      role: json['role'] as String,
      specialite: json['specialite'] as String?,
      serviceId: (json['serviceId'] as num?)?.toInt(),
      serviceNom: json['serviceNom'] as String?,
      poleId: (json['poleId'] as num?)?.toInt(),
      poleNom: json['poleNom'] as String?,
      equipeId: (json['equipeId'] as num?)?.toInt(),
      equipeNom: json['equipeNom'] as String?,
      photo: json['photo'] as String?,
      dateNaissance: json['dateNaissance'] == null
          ? null
          : DateTime.parse(json['dateNaissance'] as String),
      telephone: json['telephone'] as String?,
      adresse: json['adresse'] as String?,
      dateEmbauche: json['dateEmbauche'] == null
          ? null
          : DateTime.parse(json['dateEmbauche'] as String),
      actif: json['actif'] as bool?,
      createdAt: json['createdAt'] == null
          ? null
          : DateTime.parse(json['createdAt'] as String),
      updatedAt: json['updatedAt'] == null
          ? null
          : DateTime.parse(json['updatedAt'] as String),
    );

Map<String, dynamic> _$StaffUserToJson(StaffUser instance) => <String, dynamic>{
      'id': instance.id,
      'nom': instance.nom,
      'prenom': instance.prenom,
      'email': instance.email,
      'role': instance.role,
      'specialite': instance.specialite,
      'serviceId': instance.serviceId,
      'serviceNom': instance.serviceNom,
      'poleId': instance.poleId,
      'poleNom': instance.poleNom,
      'equipeId': instance.equipeId,
      'equipeNom': instance.equipeNom,
      'photo': instance.photo,
      'dateNaissance': instance.dateNaissance?.toIso8601String(),
      'telephone': instance.telephone,
      'adresse': instance.adresse,
      'dateEmbauche': instance.dateEmbauche?.toIso8601String(),
      'actif': instance.actif,
      'createdAt': instance.createdAt?.toIso8601String(),
      'updatedAt': instance.updatedAt?.toIso8601String(),
    };
